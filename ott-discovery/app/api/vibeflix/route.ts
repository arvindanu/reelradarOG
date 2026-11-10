import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TMDB = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';
const recentRequests = new Map<string, number>();

type Obj = Record<string, any>;
type MediaType = 'movie' | 'tv';
type Answers = {
  genre: string;
  story: string;
  tone: string;
  themes: string;
  pacing: string;
  style: string;
  format: string;
  company: string;
  language?: string;
  region?: string;
};
type Provider = { id: number; name: string; logo: string | null };
type Candidate = {
  id: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string;
  year: string;
  rating: number | null;
  voteCount: number;
  language: string;
  genres: number[];
  runtime: number | null;
  providers: Provider[];
  watchLink: string | null;
  trailerKey: string | null;
  score: number;
  reasons: string[];
};
type RankedCandidate = { item: Candidate; score: number; reasons: string[] };

const GENRE_IDS: Record<string, number> = {
  action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, fantasy: 14, history: 36,
  horror: 27, music: 10402, mystery: 9648, romance: 10749,
  scifi: 878, thriller: 53, war: 10752, western: 37,
};

const GENRE_NAMES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

const STORY_HINTS: Record<string, number[]> = {
  mystery: [9648, 80, 53], survival: [12, 28, 53, 18], relationships: [18, 10749, 35],
  heist: [80, 28, 53], transformation: [18, 14, 10751], moral_dilemma: [18, 80, 53],
  worldbuilding: [878, 14, 12], investigation: [9648, 80, 53],
};
const TONE_HINTS: Record<string, number[]> = {
  light: [35, 10751, 16, 10749], tense: [53, 80, 9648, 28],
  dark: [27, 80, 53, 18], hopeful: [18, 10751, 35], emotional: [18, 10749],
  eerie: [27, 9648, 53], adventurous: [12, 14, 28],
};
const THEME_HINTS: Record<string, number[]> = {
  identity: [18, 878, 9648], justice: [80, 18, 53], family: [10751, 18, 35],
  ambition: [18, 80, 36], love_loss: [10749, 18], survival: [28, 12, 53],
  technology: [878, 53, 18], society: [18, 80, 99],
};
const STYLE_HINTS: Record<string, number[]> = {
  realistic: [18, 80, 36], atmospheric: [9648, 27, 18],
  imaginative: [14, 878, 12], historical: [36, 10752, 18],
  futuristic: [878, 28, 9648], surreal: [14, 878, 9648],
  intimate: [18, 10749, 35],
};

const unique = <T,>(items: T[]) => [...new Set(items)];
const imageUrl = (path?: string | null, size = 'w500') =>
  path ? `${IMAGE}/${size}${path}` : null;

async function tmdb(path: string, params: Record<string, string> = {}) {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  const key = process.env.TMDB_API_KEY?.trim();
  if (!token && !key) {
    throw new Error('TMDB credentials are missing. Add TMDB_ACCESS_TOKEN or TMDB_API_KEY to your environment.');
  }

  const url = new URL(`${TMDB}${path}`);
  Object.entries(params).forEach(([name, value]) => {
    if (value !== '') url.searchParams.set(name, value);
  });
  if (!token && key) url.searchParams.set('api_key', key);

  const response = await fetch(url, {
    headers: token
      ? { accept: 'application/json', Authorization: `Bearer ${token}` }
      : { accept: 'application/json' },
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('TMDB is receiving too many requests. Please try again in a moment.');
    throw new Error(`TMDB request failed (${response.status}).`);
  }
  return response.json() as Promise<Obj>;
}

function normalize(row: Obj, mediaType: MediaType): Candidate {
  const releaseDate = mediaType === 'movie'
    ? String(row.release_date ?? '')
    : String(row.first_air_date ?? '');

  return {
    id: Number(row.id),
    mediaType,
    title: String(mediaType === 'movie' ? row.title ?? '' : row.name ?? ''),
    overview: String(row.overview ?? ''),
    poster: imageUrl(row.poster_path),
    backdrop: imageUrl(row.backdrop_path, 'w780'),
    releaseDate,
    year: releaseDate ? releaseDate.slice(0, 4) : '',
    rating: Number.isFinite(Number(row.vote_average)) ? Number(row.vote_average) : null,
    voteCount: Number(row.vote_count) || 0,
    language: String(row.original_language ?? ''),
    genres: Array.isArray(row.genre_ids) ? row.genre_ids.map(Number) : [],
    runtime: null,
    providers: [],
    watchLink: null,
    trailerKey: null,
    score: 0,
    reasons: [],
  };
}

function isReleased(item: Candidate) {
  if (!item.releaseDate) return true;
  const today = new Date().toISOString().slice(0, 10);
  return item.releaseDate <= today;
}

function scoreCandidate(item: Candidate, answers: Answers, excluded: Set<string>): RankedCandidate {
  if (excluded.has(`${item.mediaType}:${item.id}`)) {
    return { item, score: -1000, reasons: [] };
  }

  const genreIds = new Set(item.genres);
  let score = 40;
  const reasons: string[] = [];
  const preferredGenre = GENRE_IDS[answers.genre];

  if (preferredGenre && genreIds.has(preferredGenre)) {
    score += 24;
    reasons.push(`matches your ${answers.genre} genre preference`);
  }
  const hintGroups = [
    STORY_HINTS[answers.story],
    TONE_HINTS[answers.tone],
    THEME_HINTS[answers.themes],
    STYLE_HINTS[answers.style],
  ].filter((group): group is number[] => Array.isArray(group));

  for (const group of hintGroups) {
    if (group.some(id => genreIds.has(id))) score += 7;
  }

  if (answers.language && answers.language !== 'any') {
    if (item.language === answers.language) {
      score += 14;
      reasons.push('matches your language preference');
    } else {
      score -= 12;
    }
  }

  if (answers.company === 'family') {
    if (genreIds.has(10751) || genreIds.has(16)) score += 12;
    if (genreIds.has(27) || genreIds.has(10752)) score -= 30;
  }
  if (answers.company === 'date' && (genreIds.has(10749) || genreIds.has(35) || genreIds.has(18))) score += 5;
  if (answers.company === 'friends' && (genreIds.has(28) || genreIds.has(35) || genreIds.has(27))) score += 5;

  score += Math.min(9, (item.rating ?? 0) * 0.9);
  if (item.voteCount >= 1500) score += 7;
  else if (item.voteCount >= 300) score += 4;
  else if (item.voteCount < 50) score -= 7;

  if (answers.pacing === 'fast' && (genreIds.has(28) || genreIds.has(53) || genreIds.has(80))) score += 3;
  if (answers.pacing === 'slow' && (genreIds.has(18) || genreIds.has(10749) || genreIds.has(36))) score += 3;

  if (reasons.length < 2 && genreIds.size) {
    reasons.push(`has ${[...genreIds].slice(0, 2).map(id => GENRE_NAMES[id]).filter(Boolean).join(' and ')} elements`);
  }
  if (reasons.length < 2) reasons.push('has a strong audience and rating signal');

  return { item, score, reasons: unique(reasons).slice(0, 3) };
}

function parseGeminiJson(raw: string): Obj | null {
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? parsed as Obj : null;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as Obj;
    } catch {
      return null;
    }
  }
}

async function askGemini(answers: Answers, candidates: Candidate[]) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = (process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite').replace(/^models\//, '');
  const answerText = {
    preferredGenre: answers.genre,
    storyType: answers.story,
    desiredTone: answers.tone,
    themes: answers.themes,
    pacing: answers.pacing,
    cinematicStyle: answers.style,
    watchFormat: answers.format,
    viewingCompany: answers.company,
    originalLanguage: answers.language || 'any',
  };

  const candidateText = candidates.map(item => ({
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    overview: item.overview.slice(0, 650),
    genres: item.genres.map(id => GENRE_NAMES[id]).filter(Boolean),
    rating: item.rating,
    voteCount: item.voteCount,
    originalLanguage: item.language,
  }));

  const prompt = `You are the recommendation intelligence behind VibeFlix, a movie and TV discovery feature.
Choose the single real title that best fits the user's complete viewing taste. You MUST choose only from the supplied TMDB candidates. Never invent, rename, or substitute a title or ID.

Evaluate semantic fit, not just genre overlap:
- Does the premise/story match the user's story preference?
- Do the tone, themes, pacing and cinematic style fit?
- Does the title fit the requested format and viewing company?
- Treat language as a firm preference when one is selected.
- For family viewing, avoid adult, sexually explicit, graphic horror, and strongly unsuitable titles. If uncertain, prefer broadly family-appropriate content.
- Prefer a genuinely strong match over a famous or highly rated title. Popularity and rating are secondary tie-breakers.
- Do not claim plot details that are not supported by the supplied overview.
- Return 3-5 short, specific reasons grounded in the title and answers.
- The explanation should connect the user's choices to this particular title, not repeat generic phrases.

USER'S EIGHT ANSWERS:
${JSON.stringify(answerText)}

VERIFIED TMDB CANDIDATES:
${JSON.stringify(candidateText)}

Return ONLY valid JSON in this exact shape:
{
  "selectedId": 123,
  "selectedMediaType": "movie",
  "matchScore": 91,
  "explanation": "A concise 2-4 sentence explanation of why this specific title fits the complete set of answers.",
  "reasons": ["Specific reason one", "Specific reason two", "Specific reason three"],
  "runnerUps": [
    { "id": 456, "mediaType": "movie", "reasons": ["Short fit reason"] }
  ]
}
matchScore must be an integer from 70 to 98. Include at most 4 runnerUps, all selected from the supplied candidates.`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 1800,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(25000),
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    console.error('Gemini VibeFlix request failed:', response.status, details.slice(0, 500));
    return null;
  }

  const payload = await response.json() as Obj;
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part: Obj) => typeof part.text === 'string' ? part.text : '')
    .join('') ?? '';
  return parseGeminiJson(text);
}

async function enrich(item: Candidate, region: string): Promise<Candidate> {
  const type = item.mediaType;
  const [details, videos, providers] = await Promise.all([
    tmdb(`/${type}/${item.id}`, { language: 'en-US' }).catch(() => ({} as Obj)),
    tmdb(`/${type}/${item.id}/videos`, { language: 'en-US' }).catch(() => ({} as Obj)),
    tmdb(`/${type}/${item.id}/watch/providers`).catch(() => ({} as Obj)),
  ]);

  const videoRows = videos.results ?? [];
  const trailer = videoRows.find((video: Obj) =>
    video.site === 'YouTube' && video.type === 'Trailer' && video.official
  ) ?? videoRows.find((video: Obj) => video.site === 'YouTube' && video.type === 'Trailer');

  const regionData = providers.results?.[region] ?? providers.results?.US ?? {};
  const providerRows = [
    ...(regionData.flatrate ?? []),
    ...(regionData.rent ?? []),
    ...(regionData.buy ?? []),
  ];
  const providerMap = new Map<number, Provider>();
  for (const provider of providerRows) {
    const id = Number(provider.provider_id);
    providerMap.set(id, {
      id,
      name: String(provider.provider_name),
      logo: imageUrl(provider.logo_path, 'w92'),
    });
  }

  const runtime = type === 'movie'
    ? Number(details.runtime) || null
    : Number(details.episode_run_time?.[0]) || null;

  return {
    ...item,
    runtime,
    providers: [...providerMap.values()].slice(0, 6),
    watchLink: typeof regionData.link === 'string' ? regionData.link : null,
    trailerKey: typeof trailer?.key === 'string' ? trailer.key : null,
  };
}

function validCandidateId(id: unknown, mediaType: unknown, candidates: Candidate[]) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || (mediaType !== 'movie' && mediaType !== 'tv')) return null;
  return candidates.find(item => item.id === numericId && item.mediaType === mediaType) ?? null;
}

export async function POST(request: NextRequest) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const now = Date.now();
  const previous = recentRequests.get(ip) ?? 0;
  if (now - previous < 1200) {
    return NextResponse.json({ error: 'Please wait a moment before requesting another match.' }, { status: 429 });
  }
  recentRequests.set(ip, now);
  if (recentRequests.size > 1000) {
    for (const [key, time] of recentRequests) {
      if (now - time > 60_000) recentRequests.delete(key);
    }
  }

  try {
    const body = await request.json().catch(() => ({}));
    const raw = (body.answers ?? {}) as Partial<Answers>;
    const answers: Answers = {
      genre: String(raw.genre || 'drama'),
      story: String(raw.story || 'mystery'),
      tone: String(raw.tone || 'balanced'),
      themes: String(raw.themes || 'identity'),
      pacing: String(raw.pacing || 'balanced'),
      style: String(raw.style || 'realistic'),
      format: String(raw.format || 'any'),
      company: String(raw.company || 'solo'),
      language: String(raw.language || 'any'),
      region: String(raw.region || 'IN'),
    };
    const regionValue = (answers.region ?? 'IN').toUpperCase();
const region = /^[A-Z]{2}$/.test(regionValue) ? regionValue : 'IN';
    const excluded = new Set<string>(
      Array.isArray(body.exclude) ? body.exclude.map((value: unknown) => String(value)) : []
    );

    const requestedMedia: MediaType[] = answers.format === 'series'
      ? ['tv']
      : answers.format === 'any'
        ? ['movie', 'tv']
        : ['movie'];

    const language = answers.language !== 'any' ? answers.language : '';
    const genreId = GENRE_IDS[answers.genre];
    const baseParams: Record<string, string> = {
      include_adult: 'false',
      include_video: 'false',
      language: 'en-US',
      sort_by: 'popularity.desc',
      'vote_count.gte': answers.company === 'family' ? '35' : '60',
      'vote_average.gte': '5.8',
      page: '1',
    };
    if (genreId) baseParams.with_genres = String(genreId);
    if (language) baseParams.with_original_language = language;

    if (answers.format === 'short') {
      baseParams['with_runtime.gte'] = '1';
      baseParams['with_runtime.lte'] = '100';
    } else if (answers.format === 'feature') {
      baseParams['with_runtime.gte'] = '85';
      baseParams['with_runtime.lte'] = '190';
    }

    const discoverRequests: Array<Promise<Obj>> = [];
    for (const type of requestedMedia) {
      discoverRequests.push(tmdb(`/discover/${type}`, { ...baseParams, page: '1' }));
      discoverRequests.push(tmdb(`/discover/${type}`, { ...baseParams, page: '2' }));
      discoverRequests.push(tmdb(`/discover/${type}`, {
        ...baseParams,
        sort_by: 'vote_average.desc',
        page: '1',
        'vote_count.gte': answers.company === 'family' ? '20' : '100',
      }));
    }

    const responses = await Promise.all(discoverRequests);
    const discovered = responses.flatMap((response, index) => {
      const mediaType = requestedMedia[Math.floor(index / 3)];
      return (response.results ?? []).map((row: Obj) => normalize(row, mediaType));
    });

    let pool = [...new Map(discovered
      .filter(item => item.id && item.title && isReleased(item))
      .map(item => [`${item.mediaType}:${item.id}`, item] as const)).values()];

    let ranked = pool
      .map(item => scoreCandidate(item, answers, excluded))
      .filter(entry => entry.score > -100)
      .sort((a, b) => b.score - a.score);

    // If the preferred genre/language/format is too restrictive, broaden the pool
    // while preserving media type, release status, language preference where possible,
    // and the user's exclusions.
    if (ranked.length < 8) {
      const fallbackRequests: Array<Promise<Obj>> = [];
      for (const type of requestedMedia) {
        const relaxed: Record<string, string> = {
          include_adult: 'false',
          include_video: 'false',
          language: 'en-US',
          sort_by: 'popularity.desc',
          'vote_count.gte': '25',
          'vote_average.gte': '5.3',
          page: '3',
        };
        if (language) relaxed.with_original_language = language;
        if (answers.format === 'short' && type === 'movie') relaxed['with_runtime.lte'] = '105';
        if (answers.format === 'feature' && type === 'movie') {
          relaxed['with_runtime.gte'] = '80';
          relaxed['with_runtime.lte'] = '200';
        }
        fallbackRequests.push(tmdb(`/discover/${type}`, relaxed));
      }

      const fallbackResponses = await Promise.all(fallbackRequests);
      const fallbackRows = fallbackResponses.flatMap((response, index) =>
        (response.results ?? []).map((row: Obj) => normalize(row, requestedMedia[index]))
      );
      pool = [...new Map([...pool, ...fallbackRows]
        .filter(item => item.id && item.title && isReleased(item))
        .map(item => [`${item.mediaType}:${item.id}`, item] as const)).values()];
      ranked = pool
        .map(item => scoreCandidate(item, answers, excluded))
        .filter(entry => entry.score > -100)
        .sort((a, b) => b.score - a.score);
    }

    if (!ranked.length) {
      return NextResponse.json({
        error: 'No titles matched those answers. Try another genre, language, or format.',
      }, { status: 404 });
    }

    // Give Gemini a varied but quality-filtered shortlist. It may only choose from these IDs.
    const finalists = ranked.slice(0, 36).map(entry => entry.item);
    let aiData: Obj | null = null;
    try {
      aiData = await askGemini(answers, finalists);
    } catch (error) {
      console.error('Gemini VibeFlix analysis error:', error);
    }

    const aiMatch = aiData
      ? validCandidateId(aiData.selectedId, aiData.selectedMediaType, finalists)
      : null;
    const primary = aiMatch ?? ranked[0].item;

    const aiRunnerUps: Candidate[] = [];
    if (aiData && Array.isArray(aiData.runnerUps)) {
      for (const entry of aiData.runnerUps.slice(0, 4)) {
        const item = validCandidateId(entry?.id, entry?.mediaType, finalists);
        if (!item || (item.id === primary.id && item.mediaType === primary.mediaType)) continue;
        if (!aiRunnerUps.some(existing => existing.id === item.id && existing.mediaType === item.mediaType)) {
          aiRunnerUps.push(item);
        }
      }
    }

    const fallbackRunners = ranked
      .map(entry => entry.item)
      .filter(item => item.id !== primary.id || item.mediaType !== primary.mediaType);
    const runnerCandidates = [
      ...aiRunnerUps,
      ...fallbackRunners.filter(item => !aiRunnerUps.some(ai => ai.id === item.id && ai.mediaType === item.mediaType)),
    ].slice(0, 4);

    const chosen = [primary, ...runnerCandidates];
    const enriched = await Promise.all(chosen.map(item => enrich(item, region)));
    const match = enriched[0];
    const runnersUp = enriched.slice(1);

    const rawScore = Number(aiData?.matchScore);
    const matchPercent = aiMatch && Number.isFinite(rawScore)
      ? Math.max(70, Math.min(98, Math.round(rawScore)))
      : Math.max(74, Math.min(94, Math.round(78 + ranked[0].score / 9)));

    const explanation = aiMatch && typeof aiData?.explanation === 'string'
      ? aiData.explanation.trim().slice(0, 650)
      : `This pick is a strong starting point for your ${answers.genre} preference, with a story and atmosphere that align with the viewing style you described. The recommendation is based on its TMDB genres, synopsis, audience rating, and available title details.`;

    const aiReasons = aiMatch && Array.isArray(aiData?.reasons)
      ? aiData.reasons.filter((reason: unknown): reason is string => typeof reason === 'string' && reason.trim().length > 0).slice(0, 4)
      : [];

    match.reasons = aiReasons.length
      ? aiReasons.map((reason: string) => reason.trim().slice(0, 140))
      : ranked.find(entry => entry.item.id === primary.id && entry.item.mediaType === primary.mediaType)?.reasons ?? [];

    return NextResponse.json({
      match,
      runnersUp,
      matchPercent,
      totalCandidates: ranked.length,
      matchExplanation: explanation,
      aiUsed: Boolean(aiMatch),
      note: aiMatch
        ? 'Gemini compared your eight answers with verified TMDB titles.'
        : 'Gemini was unavailable, so this pick uses the TMDB metadata fallback.',
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not find a VibeFlix match.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
