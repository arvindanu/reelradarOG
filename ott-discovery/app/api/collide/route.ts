
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

type AnyRecord = Record<string, any>;

type MovieProfile = {
  id: number;
  title: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string;
  year: string;
  rating: number | null;
  language: string;
  genres: number[];
  genreNames: string[];
  keywords: string[];
  cast: string[];
  director: string[];
  runtime: number | null;
  recommendations: number[];
  similar: number[];
};

type RankedCandidate = {
  candidate: AnyRecord;
  score: number;
  reasonsA: string[];
  reasonsB: string[];
};

type GeminiDecision = {
  matchId: number;
  reasonA: string[];
  reasonB: string[];
  whyTogether: string;
  confidence: number;
};

const GENRE_NAMES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation',
  35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy',
  36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War',
  37: 'Western',
};

const image = (path?: string | null, size = 'w500') =>
  path ? `${IMG}/${size}${path}` : null;

const unique = <T,>(values: T[]) => [...new Set(values)];

const overlap = (a: string[], b: string[]) =>
  a.filter(value => b.includes(value));

const norm = (value: string) =>
  value.toLowerCase().trim();

async function tmdb(
  path: string,
  params: Record<string, string> = {}
): Promise<AnyRecord> {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  const key = process.env.TMDB_API_KEY?.trim();

  if (!token && !key) {
    throw new Error('TMDB credentials are missing.');
  }

  const url = new URL(`${BASE}${path}`);

  Object.entries(params).forEach(([name, value]) => {
    if (value) url.searchParams.set(name, value);
  });

  if (!token && key) {
    url.searchParams.set('api_key', key);
  }

  const response = await fetch(url, {
    headers: token
      ? {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        }
      : { accept: 'application/json' },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'TMDB rate limit reached. Try again shortly.'
        : `TMDB request failed (${response.status}).`
    );
  }

  return response.json();
}

async function getProfile(id: number): Promise<MovieProfile> {
  const data = await tmdb(`/movie/${id}`, {
    append_to_response: 'keywords,credits,recommendations,similar',
  });

  const releaseDate = data.release_date ?? '';
  const keywordRows = data.keywords?.keywords ?? [];
  const castRows = data.credits?.cast ?? [];
  const crewRows = data.credits?.crew ?? [];

  const directors = crewRows
    .filter((person: AnyRecord) => person.job === 'Director')
    .map((person: AnyRecord) => person.name);

  return {
    id: data.id,
    title: data.title ?? data.original_title ?? 'Untitled',
    overview: data.overview ?? '',
    poster: image(data.poster_path),
    backdrop: image(data.backdrop_path, 'w780'),
    releaseDate,
    year: releaseDate.slice(0, 4),
    rating:
      typeof data.vote_average === 'number'
        ? data.vote_average
        : null,
    language: data.original_language ?? '',
    genres: (data.genres ?? []).map((item: AnyRecord) => item.id),
    genreNames: (data.genres ?? []).map((item: AnyRecord) => item.name),
    keywords: keywordRows.map((item: AnyRecord) => norm(item.name)),
    cast: castRows
      .slice(0, 15)
      .map((person: AnyRecord) => norm(person.name)),
    director: directors.map(norm),
    runtime: data.runtime ?? null,
    recommendations: (data.recommendations?.results ?? [])
      .map((item: AnyRecord) => item.id),
    similar: (data.similar?.results ?? [])
      .map((item: AnyRecord) => item.id),
  };
}

function scoreCandidate(
  candidate: AnyRecord,
  a: MovieProfile,
  b: MovieProfile
): RankedCandidate {
  const genres: string[] = (
    candidate.genres ?? []
  ).map((item: AnyRecord) => String(item.id));

  const year = Number((candidate.release_date ?? '').slice(0, 4));

  const genreA = overlap(
    genres,
    a.genres.map(String)
  );

  const genreB = overlap(
    genres,
    b.genres.map(String)
  );

  const keywordNames: string[] = candidate.__keywords ?? [];
  const castNames: string[] = candidate.__cast ?? [];
  const directorNames: string[] = candidate.__director ?? [];

  const keywordA = overlap(keywordNames, a.keywords);
  const keywordB = overlap(keywordNames, b.keywords);

  const castA = overlap(castNames, a.cast);
  const castB = overlap(castNames, b.cast);

  const directorA = overlap(directorNames, a.director);
  const directorB = overlap(directorNames, b.director);

  const languageA = candidate.original_language === a.language;
  const languageB = candidate.original_language === b.language;

  const eraA =
    year > 0 &&
    Number(a.year) > 0 &&
    Math.abs(year - Number(a.year)) <= 10;

  const eraB =
    year > 0 &&
    Number(b.year) > 0 &&
    Math.abs(year - Number(b.year)) <= 10;

  const rating = Number(candidate.vote_average ?? 0);

  const ratingA =
    a.rating !== null &&
    Math.abs(rating - a.rating) <= 1.5;

  const ratingB =
    b.rating !== null &&
    Math.abs(rating - b.rating) <= 1.5;

  const coverageA = Boolean(
    genreA.length ||
    keywordA.length ||
    castA.length ||
    directorA.length ||
    languageA
  );

  const coverageB = Boolean(
    genreB.length ||
    keywordB.length ||
    castB.length ||
    directorB.length ||
    languageB
  );

  const score =
    Math.min(genreA.length, 2) * 8 +
    Math.min(genreB.length, 2) * 8 +
    Math.min(keywordA.length, 3) * 5 +
    Math.min(keywordB.length, 3) * 5 +
    Math.min(castA.length, 2) * 4 +
    Math.min(castB.length, 2) * 4 +
    (directorA.length ? 12 : 0) +
    (directorB.length ? 12 : 0) +
    (languageA ? 3 : 0) +
    (languageB ? 3 : 0) +
    (eraA ? 2 : 0) +
    (eraB ? 2 : 0) +
    (ratingA ? 1 : 0) +
    (ratingB ? 1 : 0) +
    (coverageA && coverageB ? 15 : 0);

  const reasonsA = unique([
    ...genreA.map(id => GENRE_NAMES[Number(id)] ?? `Genre ${id}`),
    ...keywordA.slice(0, 3),
    ...castA.slice(0, 2),
    ...(directorA.length ? ['Shared director'] : []),
    ...(languageA ? ['Original language'] : []),
    ...(eraA ? ['Similar release era'] : []),
    ...(ratingA ? ['Similar audience rating'] : []),
  ]);

  const reasonsB = unique([
    ...genreB.map(id => GENRE_NAMES[Number(id)] ?? `Genre ${id}`),
    ...keywordB.slice(0, 3),
    ...castB.slice(0, 2),
    ...(directorB.length ? ['Shared director'] : []),
    ...(languageB ? ['Original language'] : []),
    ...(eraB ? ['Similar release era'] : []),
    ...(ratingB ? ['Similar audience rating'] : []),
  ]);

  return {
    score,
    candidate,
    reasonsA,
    reasonsB,
  };
}

function toResult(candidate: AnyRecord) {
  const releaseDate = candidate.release_date ?? '';

  return {
    id: candidate.id,
    mediaType: 'movie',
    title: candidate.title ?? candidate.original_title ?? 'Untitled',
    overview: candidate.overview ?? '',
    poster: image(candidate.poster_path),
    backdrop: image(candidate.backdrop_path, 'w780'),
    releaseDate,
    year: releaseDate.slice(0, 4),
    rating:
      typeof candidate.vote_average === 'number'
        ? candidate.vote_average
        : null,
    language: candidate.original_language ?? '',
    genres: (candidate.genres ?? []).map(
      (item: AnyRecord) => Number(item.id)
    ),
    genreNames: (candidate.genres ?? []).map(
      (item: AnyRecord) => item.name
    ),
    trailerKey: null,
    trailerThumb: null,
    providers: [],
    watchLink: `https://www.themoviedb.org/movie/${candidate.id}`,
  };
}

function cleanReasons(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;

  const cleaned = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 4);

  return cleaned.length ? cleaned : fallback;
}

async function askGemini(
  a: MovieProfile,
  b: MovieProfile,
  candidates: RankedCandidate[]
): Promise<GeminiDecision | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    console.warn('Gemini API key is missing. Using metadata fallback.');
    return null;
  }

  const model =
    process.env.GEMINI_MODEL?.trim() ||
    'gemini-3.5-flash-lite';

  const candidateData = candidates.map(entry => {
    const c = entry.candidate;

    return {
      id: c.id,
      title: c.title ?? c.original_title,
      year: c.release_date?.slice(0, 4) ?? '',
      overview: c.overview ?? '',
      genres: (c.genres ?? []).map(
        (genre: AnyRecord) => genre.name
      ),
      keywords: (c.__keywords ?? []).slice(0, 12),
      cast: (c.__cast ?? []).slice(0, 8),
      directors: (c.__director ?? []).slice(0, 3),
      language: c.original_language ?? '',
      rating: c.vote_average ?? null,
      metadataScore: entry.score,
      connectionToMovieA: entry.reasonsA,
      connectionToMovieB: entry.reasonsB,
    };
  });

  const prompt = `
You are REELRADAR's expert cinematic collision engine.

Your job is to find the strongest already-released movie that combines
the cinematic DNA of two selected movies.

SELECTED MOVIE A:
${JSON.stringify({
  title: a.title,
  year: a.year,
  overview: a.overview,
  genres: a.genreNames,
  keywords: a.keywords,
  cast: a.cast.slice(0, 10),
  directors: a.director,
  language: a.language,
  rating: a.rating,
  runtime: a.runtime,
})}

SELECTED MOVIE B:
${JSON.stringify({
  title: b.title,
  year: b.year,
  overview: b.overview,
  genres: b.genreNames,
  keywords: b.keywords,
  cast: b.cast.slice(0, 10),
  directors: b.director,
  language: b.language,
  rating: b.rating,
  runtime: b.runtime,
})}

VERIFIED TMDB CANDIDATES:
${JSON.stringify(candidateData)}

YOUR TASK:

1. Evaluate every candidate using its actual cinematic content.
2. Find the movie that best bridges BOTH selected movies.
3. Consider story themes, narrative structure, atmosphere, tone,
   emotional experience, genre combinations, visual style and concepts.
4. A candidate must have a meaningful connection to BOTH movies.
5. Do not simply select the movie with the most shared genres.
6. Do not reward superficial keyword overlap over genuine thematic compatibility.
7. MetadataScore is supporting evidence, not the final decision.
8. Do not invent facts, scenes, themes or relationships.
9. Only select an ID from the verified TMDB candidates.
10. Explain the connection to each selected movie separately.
11. Explain why the candidate is a particularly strong combination
    of both cinematic identities.
12. Be honest if the connection is imperfect. Do not exaggerate.

Return ONLY valid JSON in this exact structure:

{
  "matchId": 123,
  "reasonA": [
    "Specific explanation of its connection to movie A"
  ],
  "reasonB": [
    "Specific explanation of its connection to movie B"
  ],
  "whyTogether": "A clear, engaging explanation of why this movie combines both selected movies and why it is the strongest available collision.",
  "confidence": 85
}

confidence must be an integer from 0 to 100.
reasonA and reasonB should each contain 2 to 4 meaningful explanations.
whyTogether should be approximately 60 to 100 words.
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.25,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(25000),
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      console.error(
        'Gemini API error:',
        response.status,
        errorData
      );

      return null;
    }

    const data = await response.json();

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part: AnyRecord) => part.text ?? '')
      .join('');

    if (!text) return null;

    const parsed = JSON.parse(
      text.replace(/```json|```/g, '').trim()
    );

    const matchId = Number(parsed.matchId);

    // Gemini is never allowed to invent a TMDB movie ID.
    if (
      !Number.isInteger(matchId) ||
      !candidates.some(entry => entry.candidate.id === matchId)
    ) {
      console.warn('Gemini returned an invalid candidate ID.');
      return null;
    }

    const winningEntry = candidates.find(
      entry => entry.candidate.id === matchId
    )!;

    const reasonA = cleanReasons(
      parsed.reasonA,
      winningEntry.reasonsA
    );

    const reasonB = cleanReasons(
      parsed.reasonB,
      winningEntry.reasonsB
    );

    const whyTogether =
      typeof parsed.whyTogether === 'string' &&
      parsed.whyTogether.trim().length > 30
        ? parsed.whyTogether.trim().slice(0, 1200)
        : `This movie connects the cinematic characteristics of ${a.title} and ${b.title} through its story, themes and overall movie experience.`;

    const confidence = Math.max(
      0,
      Math.min(100, Math.round(Number(parsed.confidence) || 0))
    );

    return {
      matchId,
      reasonA,
      reasonB,
      whyTogether,
      confidence,
    };
  } catch (error) {
    console.error('Gemini analysis failed:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const ids = [
      Number(body.firstId),
      Number(body.secondId),
    ];

    if (
      ids.some(id => !Number.isInteger(id) || id <= 0) ||
      ids[0] === ids[1]
    ) {
      return NextResponse.json(
        { error: 'Choose two different movies.' },
        { status: 400 }
      );
    }

    const [a, b] = await Promise.all(ids.map(getProfile));

    const sharedGenres = overlap(
      a.genres.map(String),
      b.genres.map(String)
    ).map(Number);

    const sharedKeywords = overlap(a.keywords, b.keywords);

    // Collect recommendations and similar movies from BOTH selections.
    const recommendationIds = unique([
      ...a.recommendations,
      ...a.similar,
      ...b.recommendations,
      ...b.similar,
    ]).filter(id => !ids.includes(id));

    // Discover additional candidates using the combined genre profile.
    const discoverParams: Record<string, string> = {
      sort_by: 'popularity.desc',
      include_adult: 'false',
      page: '1',
    };

    const mixedGenres = unique([
      ...a.genres,
      ...b.genres,
    ]).slice(0, 5);

    if (mixedGenres.length) {
      discoverParams.with_genres = mixedGenres.join('|');
    }

    const discoverPromises: Promise<AnyRecord>[] = [
      tmdb('/discover/movie', discoverParams),
    ];

    // Also search for movies with overlapping cinematic keywords.
    if (sharedKeywords.length) {
      discoverPromises.push(
        (async () => {
          const keywordSearch = await tmdb('/search/keyword', {
            query: sharedKeywords.slice(0, 2).join(' '),
          });

          const keywordIds = (keywordSearch.results ?? [])
            .slice(0, 3)
            .map((item: AnyRecord) => item.id);

          if (!keywordIds.length) return { results: [] };

          return tmdb('/discover/movie', {
            sort_by: 'popularity.desc',
            include_adult: 'false',
            with_keywords: keywordIds.join('|'),
          });
        })()
      );
    }

    const discovered = await Promise.all(discoverPromises);

    const candidateIds = unique([
      ...recommendationIds,
      ...discovered.flatMap(data =>
        (data.results ?? []).map((item: AnyRecord) => item.id)
      ),
    ]).filter(
      id =>
        Number.isInteger(id) &&
        id > 0 &&
        !ids.includes(id)
    ).slice(0, 55);

    if (!candidateIds.length) {
      return NextResponse.json({
        match: null,
        runnersUp: [],
        reasonA: [],
        reasonB: [],
        collisionExplanation: '',
        confidence: 0,
        aiUsed: false,
      });
    }

    // Fetch actual movie details, keywords and credits.
    const candidateDetails: AnyRecord[] = [];

    for (
      let offset = 0;
      offset < candidateIds.length;
      offset += 5
    ) {
      const batch = candidateIds.slice(offset, offset + 5);

      const results = await Promise.all(
        batch.map(async id => {
          try {
            const data = await tmdb(`/movie/${id}`, {
              append_to_response: 'keywords,credits',
            });

            const releaseDate = data.release_date ?? '';

            // Never return an unreleased movie.
            if (
              !releaseDate ||
              !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) ||
              releaseDate > new Date().toISOString().slice(0, 10) ||
              data.adult === true
            ) {
              return null;
            }

            return {
              ...data,
              __keywords: (
                data.keywords?.keywords ?? []
              ).map((item: AnyRecord) => norm(item.name)),
              __cast: (
                data.credits?.cast ?? []
              ).slice(0, 15).map(
                (person: AnyRecord) => norm(person.name)
              ),
              __director: (
                data.credits?.crew ?? []
              ).filter(
                (person: AnyRecord) => person.job === 'Director'
              ).map(
                (person: AnyRecord) => norm(person.name)
              ),
            };
          } catch (error) {
            console.warn(`Could not load candidate ${id}:`, error);
            return null;
          }
        })
      );

      
for (const item of results) {
  if (item !== null) {
    candidateDetails.push(item);
  }
}

    }

    const ranked: RankedCandidate[] = candidateDetails
      .filter(candidate =>
        candidate.id &&
        (candidate.title || candidate.original_title) &&
        candidate.poster_path &&
        candidate.overview
      )
      .map(candidate =>
        scoreCandidate(candidate, a, b)
      )
      .filter(entry =>
        entry.reasonsA.length > 0 &&
        entry.reasonsB.length > 0
      )
      .sort(
        (x, y) =>
          y.score - x.score ||
          Number(y.candidate.popularity ?? 0) -
          Number(x.candidate.popularity ?? 0)
      );

    if (!ranked.length) {
      return NextResponse.json({
        match: null,
        runnersUp: [],
        reasonA: [],
        reasonB: [],
        collisionExplanation: '',
        confidence: 0,
        aiUsed: false,
      });
    }

    // Gemini evaluates the strongest verified TMDB candidates.
    const finalists = ranked.slice(0, 20);

    const aiDecision = await askGemini(a, b, finalists);

    const winningEntry = aiDecision
      ? finalists.find(
          entry => entry.candidate.id === aiDecision.matchId
        )!
      : ranked[0];

    const winningMovie = toResult(winningEntry.candidate);

    const reasonA = aiDecision?.reasonA ??
      winningEntry.reasonsA.slice(0, 4);

    const reasonB = aiDecision?.reasonB ??
      winningEntry.reasonsB.slice(0, 4);

    const collisionExplanation = aiDecision?.whyTogether ??
      `${winningMovie.title} offers a metadata-supported connection to both ${a.title} and ${b.title}. It shares cinematic elements with each selection, including ${reasonA.slice(0, 2).join(' and ')} from the first movie and ${reasonB.slice(0, 2).join(' and ')} from the second.`;

    const runnersUp = ranked
      .filter(
        entry =>
          entry.candidate.id !== winningEntry.candidate.id
      )
      .slice(0, 5)
      .map(entry => toResult(entry.candidate));

    return NextResponse.json({
      match: winningMovie,
      reasonA,
      reasonB,
      collisionExplanation,
      confidence: aiDecision?.confidence ?? 0,
      aiUsed: Boolean(aiDecision),
      selected: [
        { id: a.id, title: a.title },
        { id: b.id, title: b.title },
      ],
      runnersUp,
    });
  } catch (error) {
    console.error('Movie Collide error:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Movie Collide failed.',
      },
      { status: 500 }
    );
  }
}
