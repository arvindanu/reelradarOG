import dropTimes from '../../../data/drop-times.json';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type TmdbItem = Record<string, any>;
const IMAGE = 'https://image.tmdb.org/t/p';

function dateOnly(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}
function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}
function normalize(item: TmdbItem, mediaType: 'movie' | 'tv', releaseType: 'theatre' | 'ott', documentary = false) {
  const date = dateOnly(mediaType === 'movie' ? item.release_date : item.next_episode_to_air?.air_date || item.first_air_date);
  const episode = mediaType === 'tv' ? item.next_episode_to_air : null;
  return {
    id: Number(item.id), mediaType,
    title: String(mediaType === 'movie' ? item.title || item.original_title : item.name || item.original_name || item.title),
    overview: String(item.overview || ''), poster: item.poster_path ? `${IMAGE}/w500${item.poster_path}` : null,
    backdrop: item.backdrop_path ? `${IMAGE}/w1280${item.backdrop_path}` : null,
    releaseDate: date, year: date ? date.slice(0, 4) : '',
    rating: typeof item.vote_average === 'number' ? item.vote_average : null,
    language: String(item.original_language || ''), genres: Array.isArray(item.genre_ids) ? item.genre_ids : [],
    popularity: Number(item.popularity || 0), releaseType: mediaType === 'movie' ? releaseType : 'ott',
    contentType: documentary || (Array.isArray(item.genre_ids) && item.genre_ids.includes(99)) ? 'documentary' : mediaType === 'tv' ? 'series' : 'movie',
    seasonNumber: episode?.season_number ?? null, episodeNumber: episode?.episode_number ?? null,
    episodeTitle: episode?.name ?? null, episodeOverview: episode?.overview ?? null,
    runtime: null, nextEpisode: Boolean(episode),
  };
}

export async function GET(request: NextRequest) {
  const region = (request.nextUrl.searchParams.get('region') || 'IN').toUpperCase().slice(0, 2);
  let timeZone = request.nextUrl.searchParams.get('timezone') || 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date()); } catch { timeZone = 'UTC'; }
  const token = process.env.TMDB_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) return NextResponse.json({ error: 'TMDB credentials are missing. Add TMDB_ACCESS_TOKEN or TMDB_API_KEY to your environment.' }, { status: 500 });

  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const today = `${dateParts.find(p => p.type === 'year')?.value}-${dateParts.find(p => p.type === 'month')?.value}-${dateParts.find(p => p.type === 'day')?.value}`;
  const end = addDays(today, 45);
  const base = 'https://api.themoviedb.org/3';
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}`, accept: 'application/json' } : { accept: 'application/json' };
  const get = async (path: string, params: Record<string, string> = {}) => {
    const url = new URL(`${base}${path}`);
    if (apiKey && !token) url.searchParams.set('api_key', apiKey);
    for (const [key, value] of Object.entries({ ...params, region })) url.searchParams.set(key, value);
    const response = await fetch(url, { headers, cache: 'no-store' });
    if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
    return response.json();
  };

  try {
    const [theatre, digital, airingToday, onAir, upcomingTv, docMovies, docTv] = await Promise.all([
      get('/discover/movie', { 'primary_release_date.gte': today, 'primary_release_date.lte': end, with_release_type: '2|3', sort_by: 'primary_release_date.asc', page: '1' }),
      get('/discover/movie', { 'primary_release_date.gte': today, 'primary_release_date.lte': end, with_release_type: '4|5|6', sort_by: 'primary_release_date.asc', page: '1' }),
      get('/tv/airing_today', { page: '1' }),
      get('/tv/on_the_air', { page: '1' }),
      get('/discover/tv', { 'first_air_date.gte': today, 'first_air_date.lte': end, sort_by: 'first_air_date.asc', page: '1' }),
      get('/discover/movie', { with_genres: '99', 'primary_release_date.gte': today, 'primary_release_date.lte': end, sort_by: 'primary_release_date.asc', page: '1' }),
      get('/discover/tv', { with_genres: '99', 'first_air_date.gte': today, 'first_air_date.lte': end, sort_by: 'first_air_date.asc', page: '1' }),
    ]);

    const movieItems = [
      ...(theatre.results || []).map((x: TmdbItem) => normalize(x, 'movie', 'theatre')),
      ...(digital.results || []).map((x: TmdbItem) => normalize(x, 'movie', 'ott')),
    ];
    const tvRaw = new Map<number, TmdbItem>();
    for (const item of [...(airingToday.results || []), ...(onAir.results || []), ...(upcomingTv.results || [])]) {
      if (item?.id && !tvRaw.has(Number(item.id))) tvRaw.set(Number(item.id), item);
    }
    const docTvIds = new Set<number>((docTv.results || []).map((x: TmdbItem) => Number(x.id)));
    const seriesRaw = [...tvRaw.values()];
    const detailTargets = seriesRaw.filter(x => !x.next_episode_to_air).slice(0, 16);
    const detailResults = await Promise.all(detailTargets.map(async item => {
      try { return await get(`/tv/${item.id}`); } catch { return item; }
    }));
    const detailsById = new Map<number, TmdbItem>(detailResults.map((x: TmdbItem): [number, TmdbItem] => [Number(x.id), x]));
    const seriesItems = seriesRaw.map(item => {
      const detailed = detailsById.get(Number(item.id)) || item;
      const merged = { ...item, ...detailed };
      return normalize(merged, 'tv', 'ott', docTvIds.has(Number(item.id)));
    }).filter((x: any) => x.releaseDate && x.releaseDate >= today);

    const documentaries = [
      ...(docMovies.results || []).map((x: TmdbItem) => normalize(x, 'movie', 'ott', true)),
      ...(docTv.results || []).map((x: TmdbItem) => normalize(x, 'tv', 'ott', true)),
    ];
    const combined = new Map<string, any>();
    for (const item of [...movieItems, ...seriesItems, ...documentaries]) {
      const key = `${item.mediaType}:${item.id}:${item.releaseDate}`;
      if (!combined.has(key)) combined.set(key, item);
      else if (item.contentType === 'documentary') combined.set(key, { ...combined.get(key), contentType: 'documentary' });
    }
    const overrides = (dropTimes as { releases?: Record<string, { time?: string; timezone?: string }> }).releases || {};
    const withOverrides = (item: any) => {
      const override = overrides[String(item.id)];
      return override?.time ? { ...item, exactTime: override.time, timeZone: override.timezone || 'Asia/Kolkata' } : item;
    };
    const items = [...combined.values()].map(withOverrides).sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999') || b.popularity - a.popularity);
    const awaited = [...movieItems, ...seriesItems].map(withOverrides)
      .filter(item => item.releaseDate && item.popularity >= 35)
      .sort((a, b) => b.popularity - a.popularity)
      .filter((item, index, list) => list.findIndex(x => x.id === item.id && x.mediaType === item.mediaType) === index)
      .slice(0, 7);

    return NextResponse.json({ items, awaited, region, updatedAt: new Date().toISOString(), range: { from: today, to: end } }, {
      headers: { 'Cache-Control': 'no-store, max-age=0', 'CDN-Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load live release data.' }, { status: 502 });
  }
}
