import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
type Row = Record<string, any>;

async function tmdb(path: string, params: Record<string, string> = {}) {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  const key = process.env.TMDB_API_KEY?.trim();
  if (!token && !key) throw new Error('TMDB credentials are missing. Add TMDB_ACCESS_TOKEN or TMDB_API_KEY to your environment.');
  const url = new URL(`${BASE}${path}`);
  for (const [name, value] of Object.entries(params)) if (value !== '') url.searchParams.set(name, value);
  if (!token && key) url.searchParams.set('api_key', key);
  const response = await fetch(url, {
    headers: token ? { accept: 'application/json', Authorization: `Bearer ${token}` } : { accept: 'application/json' },
    next: { revalidate: 1800 },
  });
  if (!response.ok) throw new Error(response.status === 429 ? 'TMDB is receiving too many requests. Please try again in a moment.' : `TMDB request failed (${response.status}).`);
  return response.json() as Promise<Row>;
}
const image = (path?: string | null, size = 'w500') => path ? `${IMG}/${size}${path}` : null;
const toTitle = (x: Row, mediaType: 'movie' | 'tv') => {
  const releaseDate = mediaType === 'tv' ? (x.first_air_date ?? '') : (x.release_date ?? '');
  return {
    id: Number(x.id), mediaType, title: x.title ?? x.name ?? x.original_title ?? x.original_name ?? 'Untitled',
    overview: x.overview ?? '', poster: image(x.poster_path), backdrop: image(x.backdrop_path, 'w780'),
    releaseDate, year: releaseDate.slice(0, 4), rating: typeof x.vote_average === 'number' ? x.vote_average : null,
    language: x.original_language ?? '', genres: (x.genre_ids ?? x.genres?.map((g: Row) => g.id) ?? []).map(Number),
    genreNames: (x.genres ?? []).map((g: Row) => g.name),
    trailerKey: null, trailerThumb: null, providers: [], watchLink: `https://www.themoviedb.org/${mediaType}/${x.id}`,
  };
};
const shuffle = <T,>(items: T[]) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const action = q.get('action') ?? 'pool';
  try {
    if (action === 'genres') {
      const type = q.get('type') ?? 'movie';
      const paths = type === 'any' ? ['/genre/movie/list', '/genre/tv/list'] : [type === 'tv' ? '/genre/tv/list' : '/genre/movie/list'];
      const responses = await Promise.all(paths.map(path => tmdb(path, { language: 'en-US' })));
      const genreMap = new Map<number, Row>();
      responses.flatMap(data => data.genres ?? []).forEach((genre: Row) => genreMap.set(Number(genre.id), genre));
      return NextResponse.json({ genres: [...genreMap.values()] }, { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } });
    }
    if (action === 'detail') {
      const type = q.get('type') === 'tv' ? 'tv' : 'movie';
      const id = Number(q.get('id'));
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'A valid title is required.' }, { status: 400 });
      const [details, videos, providers] = await Promise.all([
        tmdb(`/${type}/${id}`, { language: 'en-US' }),
        tmdb(`/${type}/${id}/videos`, { language: 'en-US' }),
        tmdb(`/${type}/${id}/watch/providers`),
      ]);
      const trailer = (videos.results ?? []).find((v: Row) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
      const region = (providers.results ?? {}).IN ?? (providers.results ?? {}).US ?? {};
      const providerRows = [...(region.flatrate ?? []), ...(region.rent ?? []), ...(region.buy ?? [])];
      const uniqueProviders = [...new Map(providerRows.map((p: Row) => [p.provider_id, p])).values()];
      const title = toTitle(details, type);
      return NextResponse.json({
        ...title, genreNames: (details.genres ?? []).map((g: Row) => g.name),
        runtime: details.runtime ?? null, seasons: details.number_of_seasons ?? null,
        trailerKey: trailer?.key ?? null, providers: uniqueProviders.map((p: Row) => ({ id: p.provider_id, name: p.provider_name, logo: image(p.logo_path, 'w92') })),
        watchLink: region.link ?? title.watchLink,
      });
    }

    const type = q.get('type') ?? 'any';
    const genreIds = (q.get('genres') ?? '').split(',').filter(Boolean).map(Number).filter(Number.isFinite);
    const language = q.get('language') ?? '';
    const minRating = Math.max(0, Math.min(10, Number(q.get('rating') ?? 0)));
    const fromYear = Number(q.get('fromYear') ?? 0);
    const toYear = Number(q.get('toYear') ?? 0);
    const mediaTypes: ('movie' | 'tv')[] = type === 'movie' || type === 'documentary' ? ['movie'] : type === 'tv' ? ['tv'] : ['movie', 'tv'];
    const tasks = mediaTypes.map(async mediaType => {
      const params: Record<string, string> = { include_adult: 'false', sort_by: 'popularity.desc', page: '1', language: 'en-US', 'vote_count.gte': '10' };
      if (genreIds.length) params.with_genres = genreIds.join('|');
      if (language) params.with_original_language = language;
      if (minRating > 0) params['vote_average.gte'] = String(minRating);
      if (mediaType === 'movie') {
        if (fromYear) params['primary_release_date.gte'] = `${fromYear}-01-01`;
        if (toYear) params['primary_release_date.lte'] = `${toYear}-12-31`;
      } else {
        if (fromYear) params['first_air_date.gte'] = `${fromYear}-01-01`;
        if (toYear) params['first_air_date.lte'] = `${toYear}-12-31`;
      }
      const pages = await Promise.all([1, 2, 3].map(page => tmdb(`/discover/${mediaType}`, { ...params, page: String(page) })));
      return { mediaType, total: Number(pages[0]?.total_results ?? 0), rows: pages.flatMap(p => p.results ?? []) };
    });
    const groups = await Promise.all(tasks);
    const totalResults = groups.reduce((sum, g) => sum + g.total, 0);
    let pool = groups.flatMap(g => g.rows.map((row: Row) => toTitle(row, g.mediaType)));
    pool = shuffle(pool.filter((x: any) => x.poster)).slice(0, 20);
    return NextResponse.json({ titles: pool, totalResults, poolSize: pool.length }, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=900' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load the roulette pool.' }, { status: 500 });
  }
}
