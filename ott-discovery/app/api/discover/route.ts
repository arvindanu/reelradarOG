
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

type AnyRecord = Record<string, any>;
type MediaKind = 'movie' | 'tv';

const DOCUMENTARY_GENRE = '99';

const FILTER_ALIASES: Record<string, string> = {
  popular: 'popular',
  trending: 'trending',
  'trending now': 'trending',
  'most watched': 'most-watched',
  'top rated': 'top-rated',
  'highest rated': 'highest-rated',
  "critics' picks": 'critics-picks',
  'critics picks': 'critics-picks',
  'audience favorites': 'audience-favorites',
  'now playing': 'now-playing',
  'in theaters': 'in-theaters',
  upcoming: 'upcoming',
  'coming soon': 'coming-soon',
  'new releases': 'new-releases',
  'recently added': 'recently-added',
  'box office hits': 'box-office-hits',
  'highest grossing': 'highest-grossing',
  'award winners': 'award-winners',
  'staff picks': 'staff-picks',
  'hidden gems': 'hidden-gems',
  underrated: 'underrated',
  classics: 'classics',
  'all-time greats': 'all-time-greats',
  'recommended for you': 'recommended-for-you',
  'because you watched': 'because-you-watched',
  'most discussed': 'most-discussed',
  'most anticipated': 'most-anticipated',
  'leaving soon': 'leaving-soon',
  'binge-worthy': 'binge-worthy',
  'short & sweet': 'short-sweet',
  'short and sweet': 'short-sweet',
};

function normalizeFilter(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[-_]+/g, ' ');
  return FILTER_ALIASES[cleaned] ?? cleaned.replace(/\s+/g, '-');
}

async function tmdb(
  path: string,
  params: Record<string, string> = {}
): Promise<AnyRecord> {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  const key = process.env.TMDB_API_KEY?.trim();

  if (!token && !key) {
    throw new Error(
      'TMDB credentials are missing. Add TMDB_ACCESS_TOKEN in Vercel Environment Variables.'
    );
  }

  const url = new URL(`${BASE}${path}`);

  Object.entries(params).forEach(([k, v]) => {
    if (v !== '') url.searchParams.set(k, v);
  });

  const headers: Record<string, string> = {
    accept: 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (key) {
    url.searchParams.set('api_key', key);
  }

  let response: Response;
const revalidate =
  path.startsWith('/watch/providers/')
    ? 86400
    : /^\/(movie|tv)\/\d+$/.test(path)
      ? 3600
      : 300;

try {
  response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    next: { revalidate },
  });
} catch {
  throw new Error(
    'Could not connect to TMDB. Check the server network connection and try again.'
  );
}

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        'TMDB rejected the credentials. Check the Read Access Token in Vercel.'
      );
    }

    if (response.status === 403) {
      throw new Error(
        'TMDB denied this request. Check your API access permissions.'
      );
    }

    if (response.status === 429) {
      throw new Error(
        'TMDB rate limit reached. Please try again shortly.'
      );
    }

    throw new Error(`TMDB request failed (${response.status}).`);
  }

  return response.json();
}

function getImage(
  path: string | null | undefined,
  size = 'w500'
): string | null {
  return path ? `${IMG}/${size}${path}` : null;
}

function getReleaseDate(item: AnyRecord): string {
  return item.release_date ?? item.first_air_date ?? '';
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function uniqueById(items: AnyRecord[]): AnyRecord[] {
  return items.filter(
    (item, index, array) =>
      array.findIndex(x => x.id === item.id) === index
  );
}

function getFilterConfig(
  filter: string,
  kind: MediaKind,
  region: string
): {
  sortBy: string;
  minDate?: string;
  maxDate?: string;
  minVotes?: string;
  minRating?: string;
  maxVotes?: string;
  minRuntime?: string;
  maxRuntime?: string;
  releaseType?: string;
  note?: string;
} {
  const movie = kind === 'movie';

  switch (filter) {
    case 'trending':
      return {
        sortBy: 'popularity.desc',
      };

    case 'popular':
      return {
        sortBy: 'popularity.desc',
      };

    case 'most-watched':
      return {
        sortBy: 'popularity.desc',
        minVotes: '20',
        note: 'Popularity is used as a viewing-interest proxy; TMDB does not provide actual watch counts.',
      };

    case 'top-rated':
      return {
        sortBy: 'vote_average.desc',
        minVotes: '100',
      };

    case 'highest-rated':
      return {
        sortBy: 'vote_average.desc',
        minVotes: '500',
      };

    case 'critics-picks':
      return {
        sortBy: 'vote_average.desc',
        minVotes: '500',
        minRating: '7.5',
        note: 'Selected using high ratings and substantial vote counts, not a verified critics list.',
      };

    case 'audience-favorites':
      return {
        sortBy: 'vote_average.desc',
        minVotes: '1000',
        minRating: '7',
      };

    case 'now-playing':
    case 'in-theaters':
      return movie
        ? {
            sortBy: 'popularity.desc',
            minDate: dateOffset(-60),
            maxDate: dateOffset(30),
            releaseType: '2|3',
          }
        : {
            sortBy: 'popularity.desc',
            minDate: dateOffset(-30),
            maxDate: dateOffset(30),
          };

    case 'upcoming':
    case 'coming-soon':
    case 'most-anticipated':
      return {
        sortBy: 'popularity.desc',
        minDate: dateOffset(1),
        maxDate: dateOffset(365),
        note:
          filter === 'most-anticipated'
            ? 'Upcoming titles are ordered by popularity as an anticipation proxy.'
            : undefined,
      };

    case 'new-releases':
      return {
        sortBy: 'popularity.desc',
        minDate: dateOffset(-30),
        maxDate: dateOffset(0),
      };

    case 'recently-added':
      return {
        sortBy: 'popularity.desc',
        minDate: dateOffset(-120),
        maxDate: dateOffset(0),
        note: 'TMDB does not expose a public recently-added timestamp; recent release dates are used.',
      };

    case 'box-office-hits':
    case 'highest-grossing':
      return movie
        ? {
            sortBy: 'revenue.desc',
            minVotes: '20',
            note: 'Movie results are sorted by reported box-office revenue.',
          }
        : {
            sortBy: 'popularity.desc',
            note: 'Box-office revenue sorting is movie-specific; TV titles use popularity.',
          };

    case 'award-winners':
      return {
        sortBy: 'vote_average.desc',
        minVotes: '500',
        minRating: '7.5',
        note: 'This is a highly rated selection, not a verified award-winner database.',
      };

    case 'staff-picks':
      return {
        sortBy: 'vote_average.desc',
        minVotes: '100',
        minRating: '7',
        note: 'Editorial-style selection based on ratings; these are not manually curated staff picks.',
      };

    case 'hidden-gems':
      return {
        sortBy: 'vote_average.desc',
        minVotes: '20',
        maxVotes: '500',
        minRating: '7.5',
      };

    case 'underrated':
      return {
        sortBy: 'vote_average.desc',
        minVotes: '20',
        maxVotes: '1000',
        minRating: '7',
      };

    case 'classics':
      return {
        sortBy: 'vote_average.desc',
        maxDate: '2000-12-31',
        minVotes: '100',
      };

    case 'all-time-greats':
      return {
        sortBy: 'vote_average.desc',
        maxDate: '2000-12-31',
        minVotes: '1000',
        minRating: '8',
      };

    case 'recommended-for-you':
    case 'because-you-watched':
      return {
        sortBy: 'popularity.desc',
        note: 'Personal recommendations require a viewing history or user profile; this is currently a general popular feed.',
      };

    case 'most-discussed':
      return {
        sortBy: 'vote_count.desc',
        minVotes: '20',
      };

    case 'leaving-soon':
      return {
        sortBy: 'popularity.desc',
        note: 'TMDB does not expose streaming-provider removal dates, so exact leaving-soon titles cannot currently be identified.',
      };

    case 'binge-worthy':
      return {
        sortBy: movie ? 'popularity.desc' : 'vote_average.desc',
        minVotes: '100',
        minRating: '7',
        note: movie
          ? 'Popular highly rated movies.'
          : 'Highly rated TV shows with audience voting activity.',
      };

    case 'short-sweet':
      return movie
        ? {
            sortBy: 'popularity.desc',
            maxRuntime: '100',
          }
        : {
            sortBy: 'popularity.desc',
            maxRuntime: '30',
            note: 'TV results are selected using episode runtime.',
          };

    default:
      return {
        sortBy: 'popularity.desc',
      };
  }
}

function buildDiscoverParams(
  kind: MediaKind,
  filter: string,
  language: string,
  region: string,
  page: number,
  documentary: boolean,
  availability: 'ott' | 'all' | 'theatre',
  genre: string,
  provider: string
): {
  params: Record<string, string>;
  note?: string;
} {
  const config = getFilterConfig(filter, kind, region);

  const params: Record<string, string> = {
    include_adult: 'false',
    language: 'en-US',
    page: String(page),
    sort_by: config.sortBy,
    region,
  };

  if (language) {
    params.with_original_language = language;
  }

  if (documentary) {
    params.with_genres = DOCUMENTARY_GENRE;
  } else if (genre) {
    params.with_genres = genre;
  }

  if (config.minDate) {
    params[
      kind === 'movie'
        ? 'primary_release_date.gte'
        : 'first_air_date.gte'
    ] = config.minDate;
  }

  if (config.maxDate) {
    params[
      kind === 'movie'
        ? 'primary_release_date.lte'
        : 'first_air_date.lte'
    ] = config.maxDate;
  }

  if (config.minVotes) {
    params['vote_count.gte'] = config.minVotes;
  }

  if (config.maxVotes) {
    params['vote_count.lte'] = config.maxVotes;
  }

  if (config.minRating) {
    params['vote_average.gte'] = config.minRating;
  }

  if (config.minRuntime) {
    params['with_runtime.gte'] = config.minRuntime;
  }

  if (config.maxRuntime) {
    params['with_runtime.lte'] = config.maxRuntime;
  }

  if (config.releaseType && kind === 'movie') {
    params.with_release_type = config.releaseType;
  }

  if (availability === 'ott' || provider) {
    params.watch_region = region;
  }

  if (availability === 'ott') {
    params.with_watch_monetization_types = 'flatrate|free|ads';
  }

  if (provider) {
    params.with_watch_providers = provider;
  }

  if (availability === 'theatre') {
    if (kind === 'movie') {
      params.with_release_type = '2|3';
      params['primary_release_date.gte'] = dateOffset(-60);
      params['primary_release_date.lte'] = dateOffset(45);
    } else {
      // TMDB does not classify TV episodes as theatrical releases.
      params.with_original_language = language || params.with_original_language || '';
      params['first_air_date.gte'] = dateOffset(-30);
      params['first_air_date.lte'] = dateOffset(45);
    }
  }

  return {
    params,
    note: config.note,
  };
}

function getCertification(
  details: AnyRecord,
  type: MediaKind,
  region: string
): string | null {
  if (type === 'movie') {
    const entries = details.release_dates?.results ?? [];
    const country = entries.find(
      (entry: AnyRecord) => entry.iso_3166_1 === region
    );

    const release = country?.release_dates?.find(
      (entry: AnyRecord) => entry.certification
    );

    return release?.certification || null;
  }

  const entries = details.content_ratings?.results ?? [];
  const country = entries.find(
    (entry: AnyRecord) => entry.iso_3166_1 === region
  );

  return country?.rating || null;
}

function getCrewMembers(
  credits: AnyRecord,
  jobs: string[]
): AnyRecord[] {
  const crew = credits.crew ?? [];

  return crew
    .filter((person: AnyRecord) =>
      jobs.includes(person.job)
    )
    .map((person: AnyRecord) => ({
      id: person.id,
      name: person.name,
      job: person.job,
      department: person.department,
      profile: getImage(person.profile_path, 'w185'),
    }));
}

async function enrich(
  item: AnyRecord,
  type: MediaKind,
  region: string
) {
  let details: AnyRecord = {};

  const append =
  type === 'movie'
    ? 'videos,watch/providers,release_dates'
    : 'videos,watch/providers,content_ratings';

  try {
    details = await tmdb(`/${type}/${item.id}`, {
      append_to_response: append,
      language: 'en-US',
    });
  } catch (error) {
    console.error(
      `REELRADAR details lookup failed for ${type} ${item.id}:`,
      error
    );
  }

  const videos = details.videos?.results ?? [];

  const trailer =
    videos.find(
      (v: AnyRecord) =>
        v.site === 'YouTube' &&
        v.type === 'Trailer' &&
        v.official
    ) ??
    videos.find(
      (v: AnyRecord) =>
        v.site === 'YouTube' &&
        v.type === 'Trailer'
    ) ??
    videos.find(
      (v: AnyRecord) => v.site === 'YouTube'
    );

  const providerData =
    details['watch/providers']?.results?.[region];

  const providerList = [
    ...(providerData?.flatrate ?? []),
    ...(providerData?.free ?? []),
    ...(providerData?.ads ?? []),
    ...(providerData?.rent ?? []),
    ...(providerData?.buy ?? []),
  ];

  const providers = uniqueById(
    providerList.map((p: AnyRecord) => ({
      id: p.provider_id,
      name: p.provider_name,
      logo: getImage(p.logo_path, 'w92'),
    }))
  ).slice(0, 8);

  const credits = details.credits ?? {};

  const cast = (credits.cast ?? [])
    .slice(0, 15)
    .map((person: AnyRecord) => ({
      id: person.id,
      name: person.name,
      character: person.character ?? '',
      profile: getImage(person.profile_path, 'w185'),
      order: person.order,
    }));

  const crew = getCrewMembers(credits, [
    'Director',
    'Writer',
    'Screenplay',
    'Story',
    'Producer',
    'Executive Producer',
    'Director of Photography',
    'Original Music Composer',
    'Editor',
  ]);

  const directors = crew.filter(
    person => person.job === 'Director'
  );

  const writers = crew.filter(person =>
    ['Writer', 'Screenplay', 'Story'].includes(person.job)
  );

  const date = getReleaseDate({
    ...item,
    ...details,
  });

  const genres = (
    details.genres ??
    (item.genre_ids ?? []).map((id: number) => ({
      id,
      name: '',
    }))
  ).map((genre: AnyRecord) => ({
    id: genre.id,
    name: genre.name,
  }));

  const productionCompanies = (
    details.production_companies ?? []
  ).map((company: AnyRecord) => ({
    id: company.id,
    name: company.name,
    logo: getImage(company.logo_path, 'w185'),
    country: company.origin_country,
  }));

  const productionCountries = (
    details.production_countries ?? []
  ).map((country: AnyRecord) => ({
    name: country.name,
    code: country.iso_3166_1,
  }));

  const spokenLanguages = (
    details.spoken_languages ?? []
  ).map((language: AnyRecord) => ({
    name: language.english_name ?? language.name,
    code: language.iso_639_1,
  }));

  const keywords = (
    details.keywords?.keywords ??
    details.keywords?.results ??
    []
  ).map((keyword: AnyRecord) => ({
    id: keyword.id,
    name: keyword.name,
  }));

  const base = {
    id: item.id,
    mediaType: type,

    title: details.title ?? details.name ??
      item.title ?? item.name ?? 'Untitled',

    originalTitle:
      details.original_title ??
      details.original_name ??
      item.original_title ??
      item.original_name ??
      '',

    overview: details.overview ?? item.overview ?? '',

    tagline: details.tagline ?? '',

    poster: getImage(
      details.poster_path ?? item.poster_path
    ),

    backdrop: getImage(
      details.backdrop_path ?? item.backdrop_path,
      'w1280'
    ),

    releaseDate: date,
    year: date.slice(0, 4),

    originalLanguage:
      details.original_language ??
      item.original_language ??
      '',

    language:
      details.original_language ??
      item.original_language ??
      '',

    originCountry: details.origin_country ?? item.origin_country ?? [],

    rating:
      typeof details.vote_average === 'number'
        ? Number(details.vote_average.toFixed(1))
        : typeof item.vote_average === 'number'
          ? Number(item.vote_average.toFixed(1))
          : null,

    voteCount: details.vote_count ?? item.vote_count ?? 0,

    popularity: details.popularity ?? item.popularity ?? 0,

    genres,

    cast,
    crew,
    directors,
    writers,

    productionCompanies,
    productionCountries,
    spokenLanguages,
    keywords,

    status: details.status ?? '',
    certification: getCertification(details, type, region),

    trailerKey: trailer?.key ?? null,

    trailerThumb: trailer?.key
      ? `https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`
      : null,

    trailerUrl: trailer?.key
      ? `https://www.youtube.com/watch?v=${trailer.key}`
      : null,

    providers,
    watchLink: providerData?.link ?? null,

    homepage: details.homepage ?? null,

    imdbId: details.external_ids?.imdb_id ?? null,

    tmdbUrl: `https://www.themoviedb.org/${type}/${item.id}`,
  };

  if (type === 'movie') {
    return {
      ...base,

      runtime: details.runtime ?? null,

      budget: details.budget ?? 0,

      revenue: details.revenue ?? 0,

      releaseDateStatus: details.release_date ?? date,

      movieStatus: details.status ?? '',

      belongsToCollection: details.belongs_to_collection
        ? {
            id: details.belongs_to_collection.id,
            name: details.belongs_to_collection.name,
            poster: getImage(
              details.belongs_to_collection.poster_path
            ),
          }
        : null,

      // Movies deliberately do not receive TV episode fields.
    };
  }

  return {
    ...base,

    firstAirDate: details.first_air_date ?? date,

    lastAirDate: details.last_air_date ?? null,

    numberOfSeasons: details.number_of_seasons ?? 0,

    numberOfEpisodes: details.number_of_episodes ?? 0,

    episodeRuntime: details.episode_run_time ?? [],

    networks: (details.networks ?? []).map(
      (network: AnyRecord) => ({
        id: network.id,
        name: network.name,
        logo: getImage(network.logo_path, 'w185'),
        country: network.origin_country,
      })
    ),

    creators: (details.created_by ?? []).map(
      (creator: AnyRecord) => ({
        id: creator.id,
        name: creator.name,
        profile: getImage(creator.profile_path, 'w185'),
      })
    ),

    type: details.type ?? '',

    nextEpisode: details.next_episode_to_air
      ? {
          name: details.next_episode_to_air.name,
          episodeNumber:
            details.next_episode_to_air.episode_number,
          seasonNumber:
            details.next_episode_to_air.season_number,
          airDate: details.next_episode_to_air.air_date,
        }
      : null,

    lastEpisode: details.last_episode_to_air
      ? {
          name: details.last_episode_to_air.name,
          episodeNumber:
            details.last_episode_to_air.episode_number,
          seasonNumber:
            details.last_episode_to_air.season_number,
          airDate: details.last_episode_to_air.air_date,
        }
      : null,

    seasons: (details.seasons ?? []).map(
      (season: AnyRecord) => ({
        id: season.id,
        name: season.name,
        overview: season.overview,
        seasonNumber: season.season_number,
        episodeCount: season.episode_count,
        airDate: season.air_date,
        poster: getImage(season.poster_path),
      })
    ),

    // TV-specific fields are only returned for TV titles.
  };
}


function toCompactResult(item: AnyRecord, type: MediaKind) {
  const date = getReleaseDate(item);

  return {
    id: item.id,
    mediaType: type,

    title: item.title ?? item.name ?? 'Untitled',
    originalTitle: item.original_title ?? item.original_name ?? '',
    overview: item.overview ?? '',

    poster: getImage(item.poster_path),
    backdrop: getImage(item.backdrop_path, 'w1280'),

    releaseDate: date,
    year: date.slice(0, 4),

    originalTitleLanguage: item.original_language ?? '',
    originalLanguage: item.original_language ?? '',
    language: item.original_language ?? '',

    originCountry: item.origin_country ?? [],

    rating:
      typeof item.vote_average === 'number'
        ? Number(item.vote_average.toFixed(1))
        : null,

    voteCount: item.vote_count ?? 0,
    popularity: item.popularity ?? 0,

    genres: (item.genre_ids ?? []).map((id: number) => ({
      id,
      name: '',
    })),

    // These fields are deliberately empty in compact mode.
    // The featured carousel should not need full details.
    cast: [],
    crew: [],
    directors: [],
    writers: [],
    productionCompanies: [],
    productionCountries: [],
    spokenLanguages: [],
    keywords: [],
    providers: [],

    trailerKey: null,
    trailerThumb: null,
    trailerUrl: null,
    watchLink: null,

    certification: null,
    homepage: null,
    imdbId: null,

    tmdbUrl: `https://www.themoviedb.org/${type}/${item.id}`,
  };
}




export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams;

    const requestedType = (
      search.get('type') ?? 'all'
    ).trim().toLowerCase();

    const type = [
      'movie',
      'tv',
      'documentary',
    ].includes(requestedType)
      ? requestedType
      : 'all';

    const language = (
      search.get('language') ?? ''
    ).trim().toLowerCase();

    const regionValue = (
      search.get('region') ?? 'IN'
    ).trim().toUpperCase();

    const region = /^[A-Z]{2}$/.test(regionValue)
      ? regionValue
      : 'IN';

    const providersOnly = search.get('providers') === '1';
    const compact = search.get('compact') === '1';

    if (providersOnly) {
      const [moviesFirst, seriesFirst] = await Promise.all([
        tmdb('/watch/providers/movie', { watch_region: region, language: 'en-US', page: '1' }),
        tmdb('/watch/providers/tv', { watch_region: region, language: 'en-US', page: '1' }),
      ]);
      const providerPages = await Promise.all([
        ...Array.from({ length: Math.max(0, (moviesFirst.total_pages ?? 1) - 1) }, (_, index) =>
          tmdb('/watch/providers/movie', { watch_region: region, language: 'en-US', page: String(index + 2) })),
        ...Array.from({ length: Math.max(0, (seriesFirst.total_pages ?? 1) - 1) }, (_, index) =>
          tmdb('/watch/providers/tv', { watch_region: region, language: 'en-US', page: String(index + 2) })),
      ]);
      const allProviders = [
        ...(moviesFirst.results ?? []), ...(seriesFirst.results ?? []),
        ...providerPages.flatMap((result: AnyRecord) => result.results ?? []),
      ];
      const combined = allProviders
        .filter((item: AnyRecord, index: number, array: AnyRecord[]) =>
          array.findIndex(entry => entry.provider_id === item.provider_id) === index)
        .sort((a: AnyRecord, b: AnyRecord) => (a.display_priority ?? 999) - (b.display_priority ?? 999));
      return NextResponse.json({ providers: combined.map((item: AnyRecord) => ({
        id: item.provider_id, name: item.provider_name, logo: getImage(item.logo_path, 'w92'),
      })) });
    }

    const providerValue = (search.get('provider') ?? '').trim();
    const provider = /^\d+$/.test(providerValue) ? providerValue : '';

    const query = (
      search.get('query') ?? ''
    ).trim();

    const filter = normalizeFilter(
      search.get('filter') ?? 'popular'
    );

    const pageValue = Number(
      search.get('page') ?? '1'
    );

    const page = Number.isInteger(pageValue)
      ? Math.min(Math.max(pageValue, 1), 500)
      : 1;

    const availabilityValue = (search.get('availability') ?? 'all').trim().toLowerCase();
    const availability = (['ott', 'all', 'theatre'].includes(availabilityValue)
      ? availabilityValue
      : 'all') as 'ott' | 'all' | 'theatre';

    const documentary = type === 'documentary';
    const genreValue = (search.get('genre') ?? '').trim();
    const genre = /^\d+$/.test(genreValue) ? genreValue : '';

    const kinds: MediaKind[] =
      availability === 'theatre'
        ? (type === 'tv' ? [] : ['movie'])
        : type === 'movie'
          ? ['movie']
          : type === 'tv'
            ? ['tv']
            : ['movie', 'tv'];

    let requests: { items: AnyRecord[]; totalPages: number; totalResults: number }[] = [];
    const notes: string[] = [];

    if (query) {
      requests = await Promise.all(
        kinds.map(async kind => {
          const data = await tmdb(`/search/${kind}`, {
            query,
            include_adult: 'false',
            language: 'en-US',
            page: String(page),
          });

          return {
            items: (data.results ?? [])
            .filter((item: AnyRecord) => {
              const languageMatches =
                !language ||
                item.original_language === language;

              const documentaryMatches =
                !documentary ||
                (item.genre_ids ?? []).includes(99);
              const genreMatches =
                !genre ||
                (item.genre_ids ?? []).includes(Number(genre));

              return (
                languageMatches &&
                documentaryMatches &&
                genreMatches
              );
            })
            .map((item: AnyRecord) => ({
              ...item,
              _kind: kind,
            })),
            totalPages: data.total_pages ?? 1,
            totalResults: data.total_results ?? 0,
          };
        })
      );
    } else {
      requests = await Promise.all(
        kinds.map(async kind => {
          if (filter === 'trending' && !genre && !provider) {
            const data = await tmdb(
              `/trending/${kind}/week`,
              {
                language: 'en-US',
                page: String(page),
              }
            );

            return {
              items: (data.results ?? [])
              .filter((item: AnyRecord) => {
                const languageMatches =
                  !language ||
                  item.original_language === language;

                const documentaryMatches =
                  !documentary ||
                  (item.genre_ids ?? []).includes(99);

                return (
                  languageMatches &&
                  documentaryMatches
                );
              })
              .map((item: AnyRecord) => ({
                ...item,
                _kind: kind,
              })),
              totalPages: data.total_pages ?? 1,
              totalResults: data.total_results ?? 0,
            };
          }

          const config = buildDiscoverParams(
            kind,
            filter,
            language,
            region,
            page,
            documentary,
            availability,
            genre,
            provider
          );

          if (config.note && !notes.includes(config.note)) {
            notes.push(config.note);
          }

          const data = await tmdb(
            `/discover/${kind}`,
            config.params
          );

          return {
            items: (data.results ?? []).map(
              (item: AnyRecord) => ({
                ...item,
                _kind: kind,
              })
            ),
            totalPages: data.total_pages ?? 1,
            totalResults: data.total_results ?? 0,
          };
        })
      );
    }

    const totalPages = Math.max(1, ...requests.map(request => request.totalPages));
    const totalResults = requests.reduce((sum, request) => sum + request.totalResults, 0);

    const raw: AnyRecord[] = uniqueById(
      requests.flatMap(request => request.items)
    )
      .sort((a, b) => {
        if (filter === 'new-releases') {
          return getReleaseDate(b).localeCompare(
            getReleaseDate(a)
          );
        }

        if (
          filter === 'most-discussed' ||
          filter === 'top-rated' ||
          filter === 'highest-rated' ||
          filter === 'critics-picks' ||
          filter === 'hidden-gems' ||
          filter === 'underrated' ||
          filter === 'classics' ||
          filter === 'all-time-greats' ||
          filter === 'award-winners' ||
          filter === 'staff-picks'
        ) {
          return (
            (b.vote_average ?? 0) -
            (a.vote_average ?? 0)
          );
        }

        return (
          (b.popularity ?? 0) -
          (a.popularity ?? 0)
        );
      })
      .slice(0, 18);

   // Compact mode: return basic TMDB data without making
// additional detail requests for every title.
if (compact) {
  const compactResults = raw.map(item =>
    toCompactResult(item, item._kind as MediaKind)
  );

  return NextResponse.json(
    {
      results: compactResults,
      page,
      totalPages,
      totalResults,
      availability,
      region,
      language,
      filter,
      notes,
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
      },
    }
  );
}

// Normal mode: preserve the existing full enrichment.
const enriched = await Promise.all(
  raw.map(item =>
    enrich(
      item,
      item._kind as MediaKind,
      region
    )
  )
);

const providerFiltered = provider
  ? enriched.filter((item: AnyRecord) =>
      (item.providers ?? []).some(
        (entry: AnyRecord) => entry.id === Number(provider)
      )
    )
  : enriched;

const results = availability === 'ott'
  ? providerFiltered
      .filter((item: AnyRecord) => (item.providers ?? []).length > 0)
      .slice(0, 18)
  : providerFiltered.slice(0, 18);

return NextResponse.json(
  {
    results,
    page,
    totalPages,
    totalResults,
    availability,
    region,
    language,
    filter,
    notes,
    fetchedAt: new Date().toISOString(),
  },
  {
    headers: {
      'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
    },
  }
);
  } catch (error) {
    console.error(
      'REELRADAR discovery error:',
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : 'Unable to load titles.';

    return NextResponse.json(
      {
        error: message,
        results: [],
      },
      { status: 500 }
    );
  }
}
