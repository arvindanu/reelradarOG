import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 1800;

type ArchiveDoc = {
  identifier?: string; title?: string; year?: string | number;
  creator?: string | string[]; description?: string | string[];
  licenseurl?: string | string[]; rights?: string | string[];
};
const clean = (value: unknown): string => Array.isArray(value)
  ? value.map(String).join(', ')
  : typeof value === 'string' || typeof value === 'number' ? String(value) : '';

const categoryQuery: Record<string, string> = {
  all: 'mediatype:movies AND year:[1890 TO 1965]',
  silent: 'mediatype:movies AND year:[1890 TO 1930] AND (silent OR "silent film" OR "silent movies")',
  noir: 'mediatype:movies AND year:[1940 TO 1965] AND ("film noir" OR noir)',
  horror: 'mediatype:movies AND year:[1890 TO 1965] AND (horror OR "classic horror")',
  early: 'mediatype:movies AND year:[1890 TO 1925]',
};
const VIDEO_EXTENSIONS = /\.(mp4|m4v|ogv|webm|mov|avi|mpeg|mpg)$/i;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const category = params.get('category') || 'all';
    const page = Math.max(1, Math.min(100, Number(params.get('page') || 1)));
    const search = (params.get('q') || '').trim().slice(0, 100).replace(/[^a-zA-Z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
    const baseQuery = categoryQuery[category] || categoryQuery.all;
    const query = search ? `${baseQuery} AND (title:(${search}) OR description:(${search}) OR subject:(${search}))` : baseQuery;
    const url = new URL('https://archive.org/advancedsearch.php');
    url.searchParams.set('q', query);
    for (const field of ['identifier', 'title', 'year', 'creator', 'description', 'licenseurl', 'rights', 'subject']) url.searchParams.append('fl[]', field);
    url.searchParams.set('rows', '18');
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort[]', 'downloads desc');
    url.searchParams.set('output', 'json');

    const response = await fetch(url, { next: { revalidate: 1800 }, headers: { 'User-Agent': 'REELRADAR-NOIR/1.0' } });
    if (!response.ok) throw new Error(`Internet Archive search returned ${response.status}`);
    const payload = await response.json();
    const docs: ArchiveDoc[] = payload?.response?.docs || [];
    const checked = await Promise.all(docs.slice(0, 18).map(async doc => {
      const identifier = clean(doc.identifier);
      if (!identifier || !/^[a-zA-Z0-9_-]{1,100}$/.test(identifier)) return null;
      try {
        const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
          next: { revalidate: 3600 }, headers: { 'User-Agent': 'REELRADAR-NOIR/1.0' },
        });
        if (!metadataResponse.ok) return null;
        const metadata = await metadataResponse.json();
        const files = Array.isArray(metadata.files) ? metadata.files : [];
        const hasVideo = files.some((file: { name?: string; private?: string | boolean }) =>
          typeof file.name === 'string' && VIDEO_EXTENSIONS.test(file.name) && file.private !== 'true' && file.private !== true);
        if (!hasVideo) return null;
        const meta = metadata.metadata || {};
        const title = clean(meta.title) || clean(doc.title) || identifier;
        const year = clean(meta.year) || clean(doc.year);
        const creator = clean(meta.creator) || clean(doc.creator);
        const description = clean(meta.description) || clean(doc.description);
        const licenseUrl = clean(meta.licenseurl) || clean(doc.licenseurl);
        const rights = clean(meta.rights) || clean(doc.rights);
        return {
          identifier, title, year, creator, description: description.slice(0, 1800),
          poster: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
          rights, licenseUrl,
          detailsUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
          embedUrl: `https://archive.org/embed/${encodeURIComponent(identifier)}`,
          playable: true,
        };
      } catch { return null; }
    }));
    return NextResponse.json({ films: checked.filter(Boolean), page }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internet Archive request failed.' }, { status: 502 });
  }
}
