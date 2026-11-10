import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
type AnyRecord = Record<string, any>;

async function tmdb(path: string, params: Record<string, string> = {}) {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  const key = process.env.TMDB_API_KEY?.trim();
  if (!token && !key) throw new Error('TMDB credentials are missing.');
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (key) url.searchParams.set('api_key', key);
  const response = await fetch(url.toString(), { headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`TMDB details request failed (${response.status}).`);
  return response.json();
}
const image = (path?: string | null) => path ? `${IMG}/w185${path}` : null;

export async function GET(request: NextRequest) {
  try {
    const s = request.nextUrl.searchParams;
    const type = s.get('type') === 'tv' ? 'tv' : 'movie';
    const id = Number(s.get('id'));
    const region = /^[A-Z]{2}$/.test((s.get('region') ?? 'IN').toUpperCase()) ? (s.get('region') ?? 'IN').toUpperCase() : 'IN';
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'A valid title ID is required.' }, { status: 400 });
    const [d, credits, keywords, ratings, reviewData] = await Promise.all([
      tmdb(`/${type}/${id}`, { language: 'en-US' }),
      tmdb(`/${type}/${id}/credits`),
      tmdb(`/${type}/${id}/keywords`),
      type === 'tv' ? tmdb(`/tv/${id}/content_ratings`) : tmdb(`/movie/${id}/release_dates`),
      tmdb(`/${type}/${id}/reviews`, { language: 'en-US', page: '1' }).catch(() => ({ results: [] })),
    ]);
    const keywordRows = type === 'tv' ? (keywords.results ?? []) : (keywords.keywords ?? []);
    const ratingRow = type === 'tv'
      ? (ratings.results ?? []).find((x: AnyRecord) => x.iso_3166_1 === region) ?? (ratings.results ?? []).find((x: AnyRecord) => x.iso_3166_1 === 'US')
      : (ratings.results ?? []).find((x: AnyRecord) => x.iso_3166_1 === region) ?? (ratings.results ?? []).find((x: AnyRecord) => x.iso_3166_1 === 'US');
    const contentRating = type === 'tv'
      ? ratingRow?.rating ?? null
      : ratingRow?.release_dates?.find((x: AnyRecord) => x.certification)?.certification ?? null;
    const crew = credits.crew ?? [];
    const director = type === 'movie'
      ? crew.filter((x: AnyRecord) => x.job === 'Director').map((x: AnyRecord) => x.name)
      : [];
    const keyCrew = crew.filter((x: AnyRecord) => ['Director', 'Writer', 'Screenplay', 'Producer', 'Executive Producer', 'Creator'].includes(x.job))
      .slice(0, 18).map((x: AnyRecord) => ({ id: x.id, name: x.name, role: x.job, profile: image(x.profile_path) }));
    const cast = (credits.cast ?? []).slice(0, 20).map((x: AnyRecord) => ({
      id: x.id, name: x.name, character: x.character, profile: image(x.profile_path),
    }));
    return NextResponse.json({
      title: d.title ?? d.name ?? '',
      originalTitle: d.original_title ?? d.original_name ?? '',
      tagline: d.tagline ?? '',
      status: d.status ?? '',
      genres: (d.genres ?? []).map((x: AnyRecord) => x.name),
      keywords: keywordRows.map((x: AnyRecord) => x.name),
      countries: (d.production_countries ?? []).map((x: AnyRecord) => x.name),
      networks: (d.networks ?? []).map((x: AnyRecord) => x.name),
      runtime: d.runtime ?? null,
      episodeRuntime: Array.isArray(d.episode_run_time) ? d.episode_run_time[0] ?? null : null,
      numberOfSeasons: d.number_of_seasons ?? null,
      numberOfEpisodes: d.number_of_episodes ?? null,
      firstAirDate: d.first_air_date ?? '',
      lastAirDate: d.last_air_date ?? '',
      nextEpisode: d.next_episode_to_air?.air_date ?? null,
      contentRating,
      director,
      creators: (d.created_by ?? []).map((x: AnyRecord) => x.name),
      cast,
      crew: keyCrew,
      productionCompanies: (d.production_companies ?? []).map((x: AnyRecord) => x.name),
      voteCount: d.vote_count ?? 0,
      popularity: d.popularity ?? 0,
      budget: d.budget ?? 0,
      revenue: d.revenue ?? 0,
      homepage: d.homepage ?? null,
      imdbId: d.imdb_id ?? null,
      reviews: (reviewData.results ?? []).slice(0, 8).map((review: AnyRecord) => ({
        id: review.id,
        author: review.author ?? 'Anonymous',
        authorDetails: {
          username: review.author_details?.username ?? '',
          rating: typeof review.author_details?.rating === 'number' ? review.author_details.rating : null,
        },
        content: review.content ?? '',
        createdAt: review.created_at ?? '',
        url: review.url ?? null,
      })),
    }, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } });
  } catch (error) {
    console.error('REELRADAR details error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load details.' }, { status: 500 });
  }
}
