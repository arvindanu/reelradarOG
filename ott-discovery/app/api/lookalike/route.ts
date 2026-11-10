import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 3600;

const BASE = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';

const token = process.env.TMDB_ACCESS_TOKEN;
const apiKey = process.env.TMDB_API_KEY;

type MediaType = 'movie' | 'tv';

type Candidate = {
  id: number;
  title: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string;
  year: string;
  rating: number | null;
  voteCount: number;
  popularity: number;
  language: string;
  genres: number[];
  recommendationRank: number | null;
  similarRank: number | null;
};

function image(path?: string | null, size = 'w500') {
  return path ? `${IMAGE}/${size}${path}` : null;
}

async function tmdb(path: string) {
  const url = new URL(`${BASE}${path}`);

  if (!token && apiKey) {
    url.searchParams.set('api_key', apiKey);
  }

  const response = await fetch(url, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
          accept: 'application/json',
        }
      : { accept: 'application/json' },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.status_message === 'string'
        ? body.status_message
        : `TMDB request failed (${response.status}).`
    );
  }

  return response.json();
}

function getKeywords(value: any): Set<number> {
  const data = value?.keywords ?? value;

  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.keywords)
      ? data.keywords
      : Array.isArray(data?.results)
        ? data.results
        : [];

  return new Set(
    list
      .map((item: any) => Number(item.id))
      .filter((id: number) => Number.isInteger(id) && id > 0)
  );
}

function getOverlap(a: Set<number>, b: Set<number>) {
  if (!a.size || !b.size) return { ratio: 0, count: 0 };

  let common = 0;

  for (const value of a) {
    if (b.has(value)) common++;
  }

  return {
    ratio: common / (a.size + b.size - common),
    count: common,
  };
}

function mapCandidate(item: any, type: MediaType): Candidate {
  const releaseDate = type === 'tv'
    ? item.first_air_date ?? ''
    : item.release_date ?? '';

  return {
    id: Number(item.id),
    title: item.title ?? item.name ?? 'Untitled',
    overview: item.overview ?? '',
    poster: image(item.poster_path),
    backdrop: image(item.backdrop_path, 'w780'),
    releaseDate,
    year: releaseDate.slice(0, 4),
    rating: typeof item.vote_average === 'number'
      ? item.vote_average
      : null,
    voteCount: Number(item.vote_count) || 0,
    popularity: Number(item.popularity) || 0,
    language: item.original_language ?? '',
    genres: Array.isArray(item.genre_ids)
      ? item.genre_ids.map(Number)
      : Array.isArray(item.genres)
        ? item.genres.map((genre: any) => Number(genre.id))
        : [],
    recommendationRank: null,
    similarRank: null,
  };
}

function rankPoints(rank: number | null, weight: number) {
  if (rank === null) return 0;
  return weight / (1 + rank / 5);
}

function getScore(
  candidate: Candidate,
  source: any,
  sourceKeywords: Set<number>,
  candidateKeywords: Set<number>
) {
  const sourceGenres = new Set<number>(
    (source.genres ?? []).map((genre: any) => Number(genre.id))
  );

  const candidateGenres = new Set(candidate.genres);
  const genreOverlap = getOverlap(sourceGenres, candidateGenres);
  const keywordOverlap = getOverlap(sourceKeywords, candidateKeywords);

  const sameLanguage =
    Boolean(source.original_language) &&
    source.original_language === candidate.language;

  const sourceYear = Number(
    (source.release_date ?? source.first_air_date ?? '').slice(0, 4)
  );
  const candidateYear = Number(candidate.year);

  const yearDifference =
    sourceYear > 0 && candidateYear > 0
      ? Math.abs(sourceYear - candidateYear)
      : null;

  const eraScore = yearDifference === null
    ? 0
    : Math.exp(-yearDifference / 12);

  const rating = Math.max(0, Math.min(10, candidate.rating ?? 0)) / 10;
  const voteConfidence = Math.min(
    1,
    Math.log10(candidate.voteCount + 1) / 3
  );

  const recommendationPoints = rankPoints(
    candidate.recommendationRank,
    32
  );

  const similarPoints = rankPoints(candidate.similarRank, 22);

  const keywordPoints = keywordOverlap.ratio * 24;
  const genrePoints = genreOverlap.ratio * 12;
  const languagePoints = sameLanguage ? 5 : 0;
  const eraPoints = eraScore * 3;
  const qualityPoints = rating * voteConfidence * 2;

  const score = Math.min(
    100,
    Math.round(
      recommendationPoints +
      similarPoints +
      keywordPoints +
      genrePoints +
      languagePoints +
      eraPoints +
      qualityPoints
    )
  );

  const reasons: string[] = [];

  if (
    candidate.recommendationRank !== null &&
    candidate.similarRank !== null
  ) {
    reasons.push('Recommended and similar on TMDB');
  } else if (candidate.recommendationRank !== null) {
    reasons.push('TMDB recommendation match');
  } else if (candidate.similarRank !== null) {
    reasons.push('TMDB similar-title match');
  }

  if (keywordOverlap.count > 0) {
    reasons.push(
      `${keywordOverlap.count} shared plot keyword${keywordOverlap.count > 1 ? 's' : ''}`
    );
  }

  if (genreOverlap.count > 0) {
    reasons.push(
      `${genreOverlap.count} shared genre${genreOverlap.count > 1 ? 's' : ''}`
    );
  }

  if (sameLanguage) reasons.push('Same original language');

  if (yearDifference !== null && yearDifference <= 5) {
    reasons.push('Similar release period');
  }

  return { score, reasons };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await task(items[index]);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

function getSource(source: any, type: MediaType) {
  return {
    id: source.id,
    title: source.title ?? source.name ?? 'Selected title',
    overview: source.overview ?? '',
    poster: image(source.poster_path),
    backdrop: image(source.backdrop_path, 'w780'),
    year: (
      source.release_date ??
      source.first_air_date ??
      ''
    ).slice(0, 4),
    mediaType: type,
  };
}

async function getPagedTitleResults(
  basePath: string,
  type: MediaType,
  id: number
) {
  // Fetch three TMDB pages from both endpoints instead of only page one.
  const pages = [1, 2, 3];

  const [recommendationPages, similarPages] = await Promise.all([
    Promise.all(
      pages.map(page =>
        tmdb(`${basePath}/recommendations?language=en-US&page=${page}`)
          .catch(() => ({ results: [] }))
      )
    ),
    Promise.all(
      pages.map(page =>
        tmdb(`${basePath}/similar?language=en-US&page=${page}`)
          .catch(() => ({ results: [] }))
      )
    ),
  ]);

  const candidates = new Map<number, Candidate>();

  recommendationPages.forEach((data: any, pageIndex: number) => {
    const items = Array.isArray(data.results) ? data.results : [];

    items.forEach((item: any, index: number) => {
      const candidate = mapCandidate(item, type);
      if (!candidate.id || candidate.id === id) return;

      candidate.recommendationRank = pageIndex * 20 + index;
      candidates.set(candidate.id, candidate);
    });
  });

  similarPages.forEach((data: any, pageIndex: number) => {
    const items = Array.isArray(data.results) ? data.results : [];

    items.forEach((item: any, index: number) => {
      const candidate = mapCandidate(item, type);
      if (!candidate.id || candidate.id === id) return;

      const rank = pageIndex * 20 + index;
      const existing = candidates.get(candidate.id);

      if (existing) {
        existing.similarRank = rank;
      } else {
        candidate.similarRank = rank;
        candidates.set(candidate.id, candidate);
      }
    });
  });

  return Array.from(candidates.values())
    .sort((a, b) => {
      const aRank =
        rankPoints(a.recommendationRank, 32) +
        rankPoints(a.similarRank, 22);
      const bRank =
        rankPoints(b.recommendationRank, 32) +
        rankPoints(b.similarRank, 22);

      return (
        bRank - aRank ||
        b.popularity - a.popularity
      );
    })
    .slice(0, 72);
}

async function findTagKeywords(query: string) {
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[,;]+|\s+/)
        .map(term => term.trim())
        .filter(term => term.length >= 3)
    )
  );

  const searchTerms = Array.from(
    new Set([query.trim(), ...terms])
  ).slice(0, 8);

  const keywordResults = await Promise.all(
    searchTerms.map(term =>
      tmdb(
        `/search/keyword?query=${encodeURIComponent(term)}&page=1`
      ).catch(() => ({ results: [] }))
    )
  );

  const keywords = new Map<number, string>();

  keywordResults.forEach((data: any) => {
    const items = Array.isArray(data.results) ? data.results : [];

    items.forEach((item: any) => {
      const id = Number(item.id);
      const name = String(item.name ?? '');

      if (Number.isInteger(id) && id > 0 && name) {
        keywords.set(id, name);
      }
    });
  });

  return {
    terms,
    keywords,
  };
}

function scoreTagCandidate(
  candidate: Candidate,
  keywordNames: string[],
  terms: string[]
) {
  const normalizedKeywords = keywordNames.map(name =>
    name.toLowerCase()
  );

  const matchedTerms = terms.filter(term =>
    normalizedKeywords.some(keyword =>
      keyword.includes(term) || term.includes(keyword)
    )
  );

  const searchableText =
    `${candidate.title} ${candidate.overview}`.toLowerCase();

  const textMatches = terms.filter(term =>
    searchableText.includes(term)
  );

  const keywordCoverage = terms.length
    ? matchedTerms.length / terms.length
    : 0;

  const textCoverage = terms.length
    ? textMatches.length / terms.length
    : 0;

  const rating = Math.max(
    0,
    Math.min(10, candidate.rating ?? 0)
  ) / 10;

  const voteConfidence = Math.min(
    1,
    Math.log10(candidate.voteCount + 1) / 3
  );

  const qualityPoints = rating * voteConfidence * 5;
  const score = Math.min(
    100,
    Math.round(
      keywordCoverage * 75 +
      textCoverage * 20 +
      qualityPoints
    )
  );

  const reasons: string[] = [];

  if (matchedTerms.length > 0) {
    reasons.push(
      `${matchedTerms.length} matching tag${matchedTerms.length > 1 ? 's' : ''}`
    );
  }

  if (textMatches.length > 0) {
    reasons.push('Matching title or synopsis');
  }

  if (candidate.genres.length > 0) {
    reasons.push('Genre metadata available');
  }

  return { score, reasons };
}

async function getTagResults(
  query: string,
  type: MediaType
) {
  const { terms, keywords } = await findTagKeywords(query);

  if (!keywords.size) {
    return [];
  }

  const keywordIds = Array.from(keywords.keys()).slice(0, 20);
  const keywordFilter = keywordIds.join('|');
  const pages = [1, 2, 3];

  const discoverPages = await Promise.all(
    pages.map(page =>
      tmdb(
        `/discover/${type}?include_adult=false&language=en-US&sort_by=popularity.desc&with_keywords=${encodeURIComponent(keywordFilter)}&page=${page}`
      )
    )
  );

  const candidates = new Map<number, Candidate>();

  discoverPages.forEach((data: any) => {
    const items = Array.isArray(data.results) ? data.results : [];

    items.forEach((item: any) => {
      const candidate = mapCandidate(item, type);

      if (candidate.id) {
        candidates.set(candidate.id, candidate);
      }
    });
  });

  const candidateList = Array.from(candidates.values()).slice(0, 72);

  const enriched = await mapLimit(
    candidateList,
    5,
    async candidate => {
      try {
        const details = await tmdb(
          `/${type}/${candidate.id}?append_to_response=keywords&language=en-US`
        );

        const keywordData = details.keywords;
        const keywordList = Array.isArray(keywordData)
          ? keywordData
          : Array.isArray(keywordData?.keywords)
            ? keywordData.keywords
            : Array.isArray(keywordData?.results)
              ? keywordData.results
              : [];

        const candidateKeywordNames = keywordList
          .map((item: any) => String(item.name ?? ''))
          .filter(Boolean);

        const { score, reasons } = scoreTagCandidate(
          candidate,
          candidateKeywordNames,
          terms
        );

        return {
          ...candidate,
          score,
          reasons,
          matchType: 'similar' as const,
        };
      } catch {
        const { score, reasons } = scoreTagCandidate(
          candidate,
          [],
          terms
        );

        return {
          ...candidate,
          score,
          reasons,
          matchType: 'similar' as const,
        };
      }
    }
  );

  return enriched.sort((a, b) =>
    b.score - a.score ||
    b.voteCount - a.voteCount ||
    b.popularity - a.popularity
  );
}

export async function GET(request: NextRequest) {
  if (!token && !apiKey) {
    return NextResponse.json(
      {
        error:
          'TMDB is not configured. Add TMDB_ACCESS_TOKEN or TMDB_API_KEY to your server environment.',
      },
      { status: 500 }
    );
  }

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const type = request.nextUrl.searchParams.get('type') as MediaType | null;

  if (!query || query.length > 100) {
    return NextResponse.json({ results: [] });
  }

  if (type !== 'movie' && type !== 'tv') {
    return NextResponse.json(
      { error: 'Choose movies or series.' },
      { status: 400 }
    );
  }

  try {
    const data = await tmdb(
      `/search/${type}?query=${encodeURIComponent(query)}&include_adult=false&page=1&language=en-US`
    );

    const results = (Array.isArray(data.results) ? data.results : [])
      .slice(0, 10)
      .map((item: any) => mapCandidate(item, type));

    return NextResponse.json(
      { results },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not search TMDB right now.',
      },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!token && !apiKey) {
    return NextResponse.json(
      {
        error:
          'TMDB is not configured. Add TMDB_ACCESS_TOKEN or TMDB_API_KEY to your server environment.',
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const type: MediaType = body.type === 'tv' ? 'tv' : 'movie';

    if (body.mode === 'tags') {
      const query = typeof body.query === 'string'
        ? body.query.trim()
        : '';

      if (query.length < 2 || query.length > 100) {
        return NextResponse.json(
          { error: 'Enter tags between 2 and 100 characters.' },
          { status: 400 }
        );
      }

      const results = await getTagResults(query, type);

      return NextResponse.json({
        source: {
          id: 0,
          title: query,
          overview: '',
          poster: null,
          backdrop: null,
          year: '',
          mediaType: type,
        },
        results,
      });
    }

    const id = Number(body.id);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: 'Choose a valid movie or series first.' },
        { status: 400 }
      );
    }

    const basePath = `/${type}/${id}`;

    const [source, candidateList] = await Promise.all([
      tmdb(`${basePath}?append_to_response=keywords&language=en-US`),
      getPagedTitleResults(basePath, type, id),
    ]);

    if (!candidateList.length) {
      return NextResponse.json({
        source: getSource(source, type),
        results: [],
      });
    }

    const sourceKeywords = getKeywords(source.keywords);

    const enriched = await mapLimit(
      candidateList,
      5,
      async candidate => {
        try {
          const details = await tmdb(
            `/${type}/${candidate.id}?append_to_response=keywords&language=en-US`
          );

          const candidateKeywords = getKeywords(details.keywords);

          const { score, reasons } = getScore(
            candidate,
            source,
            sourceKeywords,
            candidateKeywords
          );

          return {
            ...candidate,
            score,
            reasons,
            matchType:
              candidate.recommendationRank !== null &&
              candidate.similarRank !== null
                ? 'both'
                : candidate.recommendationRank !== null
                  ? 'recommendation'
                  : 'similar',
          };
        } catch {
          const { score, reasons } = getScore(
            candidate,
            source,
            sourceKeywords,
            new Set<number>()
          );

          return {
            ...candidate,
            score,
            reasons,
            matchType:
              candidate.recommendationRank !== null &&
              candidate.similarRank !== null
                ? 'both'
                : candidate.recommendationRank !== null
                  ? 'recommendation'
                  : 'similar',
          };
        }
      }
    );

    const results = enriched
      .sort((a, b) =>
        b.score - a.score ||
        b.voteCount - a.voteCount ||
        b.popularity - a.popularity
      );

    return NextResponse.json({
      source: getSource(source, type),
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not generate lookalike recommendations.',
      },
      { status: 502 }
    );
  }
}