import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 3600;

const BASE = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';
type AnyRecord = Record<string, any>;

async function tmdb(path: string, params: Record<string, string> = {}) {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  const key = process.env.TMDB_API_KEY?.trim();
  if (!token && !key) throw new Error('TMDB is not configured. Add TMDB_ACCESS_TOKEN or TMDB_API_KEY to your server environment.');
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
  if (!token) url.searchParams.set('api_key', key!);
  const response = await fetch(url.toString(), {
    headers: { accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    next: { revalidate: 3600 },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.status_message === 'string' ? body.status_message : `TMDB request failed (${response.status}).`);
  }
  return response.json();
}

const image = (path?: string | null, size = 'w500') => path ? `${IMAGE}/${size}${path}` : null;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const action = params.get('action') ?? 'search';
  try {
    if (action === 'search') {
      const query = (params.get('q') ?? '').trim();
      if (!query || query.length > 100) return NextResponse.json({ results: [] });
      const data = await tmdb('/search/person', { query, include_adult: 'false', page: '1' });
      const results = (data.results ?? []).slice(0, 8).map((person: AnyRecord) => ({
        id: person.id,
        name: person.name ?? 'Unknown person',
        knownForDepartment: person.known_for_department ?? 'Acting',
        photo: image(person.profile_path, 'w185'),
        knownFor: (person.known_for ?? []).slice(0, 3).map((item: AnyRecord) => ({
          title: item.title ?? item.name ?? 'Untitled',
          mediaType: item.media_type === 'tv' ? 'tv' : 'movie',
          year: (item.release_date ?? item.first_air_date ?? '').slice(0, 4),
        })),
        popularity: Number(person.popularity) || 0,
      }));
      return NextResponse.json({ results }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
    }

    if (action === 'trending') {
      const data = await tmdb('/trending/person/week', { language: 'en-US' });
      const results = (data.results ?? []).slice(0, 12).map((person: AnyRecord) => ({
        id: person.id,
        name: person.name ?? 'Unknown person',
        knownForDepartment: person.known_for_department ?? 'Acting',
        photo: image(person.profile_path, 'w342'),
        knownFor: (person.known_for ?? []).slice(0, 2).map((item: AnyRecord) => item.title ?? item.name ?? 'Untitled'),
      }));
      return NextResponse.json({ results }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
    }

    if (action === 'profile') {
      const id = Number(params.get('id'));
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'A valid actor ID is required.' }, { status: 400 });
      // One person request returns biography, known-for metadata, social IDs and both movie/TV credits.
      const person = await tmdb(`/person/${id}`, { language: 'en-US', append_to_response: 'combined_credits,external_ids' });
      const credits = person.combined_credits ?? { cast: [], crew: [] };
      const normalizeCredit = (item: AnyRecord, creditType: 'cast' | 'crew') => ({
        id: Number(item.id),
        creditId: item.credit_id ?? `${item.id}-${creditType}-${item.job ?? item.character ?? ''}`,
        mediaType: item.media_type === 'tv' ? 'tv' : 'movie',
        title: item.title ?? item.name ?? 'Untitled',
        overview: item.overview ?? '',
        poster: image(item.poster_path, 'w500'),
        year: (item.release_date ?? item.first_air_date ?? '').slice(0, 4),
        releaseDate: item.release_date ?? item.first_air_date ?? '',
        rating: typeof item.vote_average === 'number' ? item.vote_average : null,
        popularity: Number(item.popularity) || 0,
        genreIds: Array.isArray(item.genre_ids) ? item.genre_ids : [],
        character: item.character ?? '',
        job: item.job ?? '',
        department: item.department ?? '',
        creditType,
      });
      const cast = (credits.cast ?? []).map((item: AnyRecord) => normalizeCredit(item, 'cast'));
      const crew = (credits.crew ?? []).map((item: AnyRecord) => normalizeCredit(item, 'crew'));
      return NextResponse.json({
        person: {
          id: person.id,
          name: person.name ?? 'Unknown actor',
          photo: image(person.profile_path, 'w500'),
          knownForDepartment: person.known_for_department ?? 'Acting',
          birthday: person.birthday ?? null,
          deathday: person.deathday ?? null,
          placeOfBirth: person.place_of_birth ?? null,
          biography: person.biography ?? '',
          knownFor: (person.combined_credits?.cast ?? []).slice().sort((a: AnyRecord, b: AnyRecord) => (b.popularity ?? 0) - (a.popularity ?? 0)).slice(0, 6).map((item: AnyRecord) => ({
            id: item.id,
            mediaType: item.media_type === 'tv' ? 'tv' : 'movie',
            title: item.title ?? item.name ?? 'Untitled',
            year: (item.release_date ?? item.first_air_date ?? '').slice(0, 4),
            poster: image(item.poster_path, 'w185'),
            rating: typeof item.vote_average === 'number' ? item.vote_average : null,
          })),
          externalIds: {
            imdbId: person.external_ids?.imdb_id ?? null,
            instagramId: person.external_ids?.instagram_id ?? null,
            twitterId: person.external_ids?.twitter_id ?? null,
            facebookId: person.external_ids?.facebook_id ?? null,
            tiktokId: person.external_ids?.tiktok_id ?? null,
            youtubeId: person.external_ids?.youtube_id ?? null,
          },
        },
        credits: { cast, crew },
      }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
    }

    return NextResponse.json({ error: 'Unknown ActorLens request.' }, { status: 400 });
  } catch (error) {
    console.error('ActorLens TMDB error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ActorLens could not reach TMDB right now.' }, { status: 502 });
  }
}
