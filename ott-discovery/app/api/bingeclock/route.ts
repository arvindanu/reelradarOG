import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 3600;

const BASE = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p/w500';
const token = process.env.TMDB_ACCESS_TOKEN;
const apiKey = process.env.TMDB_API_KEY;

async function tmdb(path: string) {
  const url = new URL(`${BASE}${path}`);
  if (!token && apiKey) url.searchParams.set('api_key', apiKey);
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}`, accept: 'application/json' } : { accept: 'application/json' },
    next: { revalidate: 3600 },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.status_message === 'string' ? body.status_message : `TMDB request failed (${response.status}).`);
  }
  return response.json();
}

function image(path?: string | null) { return path ? `${IMAGE}${path}` : null; }

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function GET(request: NextRequest) {
  if (!token && !apiKey) return NextResponse.json({ error: 'TMDB is not configured. Add TMDB_ACCESS_TOKEN or TMDB_API_KEY to your server environment.' }, { status: 500 });
  const type = request.nextUrl.searchParams.get('type');
  const query = request.nextUrl.searchParams.get('query')?.trim();
  if (!query || query.length > 100) return NextResponse.json({ results: [] });
  try {
    const endpoint = type === 'series' ? 'search/tv' : 'search/collection';
    const data = await tmdb(`/${endpoint}?query=${encodeURIComponent(query)}&include_adult=false&page=1`);
    const results = (Array.isArray(data.results) ? data.results : []).slice(0, 8).map((item: any) => ({
      id: item.id,
      title: item.name ?? item.title ?? 'Untitled',
      overview: item.overview ?? '',
      poster: image(item.poster_path),
      backdrop: image(item.backdrop_path),
      year: (item.first_air_date ?? item.release_date ?? '').slice(0, 4),
      mediaType: type === 'series' ? 'tv' : 'collection',
    }));
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not search TMDB right now.' }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  if (!token && !apiKey) return NextResponse.json({ error: 'TMDB is not configured. Add TMDB_ACCESS_TOKEN or TMDB_API_KEY to your server environment.' }, { status: 500 });
  try {
    const body = await request.json();
    const type = body.type === 'series' ? 'series' : 'collection';
    const id = Number(body.id);
    const skipSpecials = body.skipSpecials !== false;
    const skipUnaired = body.skipUnaired !== false;
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Choose a valid franchise or series first.' }, { status: 400 });
    const today = new Date().toISOString().slice(0, 10);

    if (type === 'collection') {
      const collection = await tmdb(`/collection/${id}`);
      const parts = Array.isArray(collection.parts) ? collection.parts : [];
      if (!parts.length) return NextResponse.json({ error: 'This franchise collection has no movies available.' }, { status: 404 });
      const movies = await mapLimit(parts, 4, async (part: any) => {
        const detail = await tmdb(`/movie/${part.id}`);
        return {
          id: detail.id,
          key: `movie-${detail.id}`,
          title: detail.title ?? part.title ?? 'Untitled movie',
          label: detail.release_date ? detail.release_date.slice(0, 4) : 'Release date TBA',
          runtime: Number(detail.runtime) > 0 ? Number(detail.runtime) : null,
          releaseDate: detail.release_date ?? '',
          poster: image(detail.poster_path ?? part.poster_path),
          type: 'movie',
        };
      });
      const filtered = movies.filter((movie: any) => !skipUnaired || !movie.releaseDate || movie.releaseDate <= today);
      const missing = filtered.filter((movie: any) => !movie.runtime).length;
      const usable = filtered.filter((movie: any) => movie.runtime);
      if (!usable.length) return NextResponse.json({ error: 'TMDB did not provide runtime data for the movies in this collection.' }, { status: 422 });
      return NextResponse.json({
        selection: { id, type, title: collection.name, poster: image(collection.poster_path), overview: collection.overview ?? '' },
        items: usable,
        missingRuntimeCount: missing,
        stats: { seasons: 0, titles: usable.length, totalMinutes: usable.reduce((sum: number, item: any) => sum + item.runtime, 0), averageMinutes: Math.round(usable.reduce((sum: number, item: any) => sum + item.runtime, 0) / usable.length) },
      });
    }

    const show = await tmdb(`/tv/${id}`);
    const seasonNumbers: number[] = Array.isArray(show.seasons)
      ? show.seasons.map((season: any) => Number(season.season_number)).filter((number: number) => Number.isInteger(number) && number >= 0 && (!skipSpecials || number !== 0))
      : [];
    const seasons = await mapLimit(seasonNumbers, 3, async seasonNumber => tmdb(`/tv/${id}/season/${seasonNumber}`));
    const averageRuntime = (Array.isArray(show.episode_run_time) ? show.episode_run_time : []).map(Number).find((n: number) => n > 0) ?? null;
    const episodes: any[] = [];
    let missingRuntimeCount = 0;
    for (const season of seasons) {
      for (const episode of Array.isArray(season.episodes) ? season.episodes : []) {
        const airDate = episode.air_date ?? '';
        if (skipUnaired && (!airDate || airDate > today)) continue;
        const kind = String(episode.episode_type ?? '').toLowerCase();
        if (skipSpecials && ['behind the scenes', 'featurette', 'clip', 'trailer', 'teaser', 'recap', 'opening credits', 'extended'].includes(kind)) continue;
        const runtime = Number(episode.runtime) > 0 ? Number(episode.runtime) : averageRuntime;
        if (!runtime) { missingRuntimeCount++; continue; }
        episodes.push({
          id: episode.id,
          key: `episode-${episode.id}`,
          title: episode.name ?? `Episode ${episode.episode_number}`,
          label: `S${String(episode.season_number).padStart(2, '0')} · E${String(episode.episode_number).padStart(2, '0')}`,
          runtime,
          releaseDate: airDate,
          poster: image(episode.still_path) ?? image(show.poster_path),
          type: 'episode',
          seasonNumber: Number(episode.season_number),
        });
      }
    }
    if (!episodes.length) return NextResponse.json({ error: 'No aired episodes with usable runtime data were found. Try disabling the special/unaired filters or check this show on TMDB.' }, { status: 422 });
    const totalMinutes = episodes.reduce((sum, episode) => sum + episode.runtime, 0);
    return NextResponse.json({
      selection: { id, type, title: show.name, poster: image(show.poster_path), overview: show.overview ?? '' },
      items: episodes,
      missingRuntimeCount,
      stats: { seasons: new Set(episodes.map(episode => episode.seasonNumber)).size, titles: episodes.length, totalMinutes, averageMinutes: Math.round(totalMinutes / episodes.length) },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'TMDB could not finish loading this watchlist. Please try again.' }, { status: 502 });
  }
}
