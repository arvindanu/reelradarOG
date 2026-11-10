'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Search, SlidersHorizontal, Play, Star, ArrowUpRight, Film, Clapperboard, Globe2, Sparkles, ChevronDown, X, Menu, Radio, ExternalLink, CalendarDays, Users, Award, Clock3, Share2, Heart, GitMerge, Check, HomeIcon, Dices, Hourglass, ScanEye, ScanSearch, CalendarClock } from 'lucide-react';
import { COUNTRIES, LANGUAGES } from '@/lib/catalog';


type Provider = { id: number; name: string; logo: string | null };
type PlatformOption = { id: number; name: string; logo: string | null };
type Person = { id: number; name: string; role?: string; character?: string; profile?: string | null };
type Title = {
  id: number; mediaType: 'movie' | 'tv'; title: string; overview: string;
  poster: string | null; backdrop: string | null; releaseDate: string;
  year: string; rating: number | null; language: string; genres: number[];
  trailerKey: string | null; trailerThumb: string | null;
  providers: Provider[]; watchLink: string | null;
};
type FullDetails = {
  title: string; originalTitle?: string; tagline?: string; status?: string;
  genres?: string[]; keywords?: string[]; countries?: string[]; networks?: string[];
  runtime?: number | null; episodeRuntime?: number | null; numberOfSeasons?: number;
  numberOfEpisodes?: number; firstAirDate?: string; lastAirDate?: string;
  nextEpisode?: string | null; contentRating?: string | null; director?: string[];
  creators?: string[]; cast?: Person[]; crew?: Person[]; productionCompanies?: string[];
  voteCount?: number; popularity?: number; budget?: number; revenue?: number;
  homepage?: string | null; imdbId?: string | null; reviews?: Review[];
};
type Mode = 'all' | 'movie' | 'tv' | 'documentary';
type Availability = 'ott' | 'all' | 'theatre';
type Review = {
  id: string; author: string; authorDetails?: { username?: string; rating?: number | null };
  content: string; createdAt?: string; url?: string | null;
};
type CollisionResult = { match: (Title & { genreNames?: string[] }) | null; runnersUp: Title[]; reasonA: string[]; reasonB: string[]; selected?: { id: number; title: string }[] };

const DISCOVERY_FILTERS = [
  'Trending Now', 'Popular', 'Top Rated', 'Now Playing',
  'Upcoming', 'Hidden Gems', 'Classics'
] as const;
type DiscoveryFilter = typeof DISCOVERY_FILTERS[number] | '';

const MOVIE_GENRES = [
  { id: 28, name: 'Action' }, { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' }, { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' }, { id: 18, name: 'Drama' },
  { id: 27, name: 'Horror' }, { id: 878, name: 'Science Fiction' }
] as const;
const TV_GENRES = [
  { id: 10759, name: 'Action & Adventure' }, { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' }, { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' }, { id: 18, name: 'Drama' },
  { id: 9648, name: 'Mystery' }, { id: 10765, name: 'Sci-Fi & Fantasy' }
] as const;
const SHARED_GENRES = [
  { id: 16, name: 'Animation' }, { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' }, { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' }, { id: 10751, name: 'Family' },
  { id: 9648, name: 'Mystery' }
] as const;
const WISHLIST_STORAGE_KEY = 'reelradar-wishlist-v1';

function getProviderWatchUrl(providerName: string, title: string, fallback: string | null) {
  const query = encodeURIComponent(title);
  const name = providerName.toLowerCase();
  if (name.includes('netflix')) return `https://www.netflix.com/search?q=${query}`;
  if (name.includes('prime video') || name.includes('amazon prime')) return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${query}`;
  if (name.includes('disney')) return `https://www.disneyplus.com/search?q=${query}`;
  if (name.includes('apple tv')) return `https://tv.apple.com/search?term=${query}`;
  if (name.includes('hulu')) return `https://www.hulu.com/search?q=${query}`;
  if (name.includes('max')) return `https://www.max.com/search?q=${query}`;
  if (name.includes('paramount')) return `https://www.paramountplus.com/search/?query=${query}`;
  if (name.includes('peacock')) return `https://www.peacocktv.com/search?q=${query}`;
  if (name.includes('crunchyroll')) return `https://www.crunchyroll.com/search?q=${query}`;
  if (name.includes('hotstar')) return `https://www.hotstar.com/in/search?q=${query}`;
  if (name.includes('zee5')) return `https://www.zee5.com/search?q=${query}`;
  if (name.includes('sonyliv')) return `https://www.sonyliv.com/search?q=${query}`;
  return fallback ?? `https://www.google.com/search?q=${encodeURIComponent(`${title} ${providerName} streaming`)}`;
}

const LANG_LABEL: Record<string, string> = Object.fromEntries(LANGUAGES.map(x => [x.code, x.label]));
const getLanguageLabel = (language?: string | null) => !language ? 'Unknown language' : (LANG_LABEL[language] ?? language.toUpperCase());

function normalizeTitle(value: unknown): Title | null {
  if (!value || typeof value !== 'object') return null;
  const x = value as Partial<Title>;
  if (typeof x.id !== 'number' || typeof x.title !== 'string') return null;
  return {
    id: x.id, mediaType: x.mediaType === 'tv' ? 'tv' : 'movie',
    title: x.title, overview: x.overview ?? '', poster: x.poster ?? null,
    backdrop: x.backdrop ?? null, releaseDate: x.releaseDate ?? '',
    year: x.year ?? '', rating: typeof x.rating === 'number' ? x.rating : null,
    language: typeof x.language === 'string' ? x.language : '',
    genres: Array.isArray(x.genres) ? x.genres : [],
    trailerKey: x.trailerKey ?? null, trailerThumb: x.trailerThumb ?? null,
    providers: Array.isArray(x.providers) ? x.providers : [], watchLink: x.watchLink ?? null,
  };
}

const Poster = memo(function Poster({ item, onOpen, selectionMode = false, selectedIndex = -1, onToggleSelect }: { item: Title; onOpen: (x: Title) => void; selectionMode?: boolean; selectedIndex?: number; onToggleSelect?: (x: Title) => void }) {
  const trailerUrl = item.trailerKey
    ? `https://www.youtube.com/watch?v=${item.trailerKey}`
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + ' official trailer')}`;
  return <article className={`poster-card ${selectionMode && selectedIndex >= 0 ? 'collide-selected' : ''}`} onClick={() => selectionMode && item.mediaType === 'movie' && onToggleSelect ? onToggleSelect(item) : onOpen(item)} tabIndex={0}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectionMode && item.mediaType === 'movie' && onToggleSelect ? onToggleSelect(item) : onOpen(item); } }}>
    <div className="poster-art">
      {item.poster ? <img
  src={item.poster}
  alt={`${item.title} poster`}
  loading="lazy"
  decoding="async"
/> : <div className="poster-fallback"><Film size={30} /><span>{item.title}</span></div>}
      <div className="poster-shade" />
      {selectionMode && <div className={`collide-select-mark ${selectedIndex >= 0 ? 'is-selected' : ''}`} aria-label={selectedIndex >= 0 ? `Selected ${selectedIndex + 1}` : 'Select movie'}>{selectedIndex >= 0 ? <><Check size={15} /> {selectedIndex + 1}</> : <GitMerge size={16} />}</div>}
      <div className="poster-topline"><span className="type-pill">{item.mediaType === 'tv' ? 'SERIES' : 'FILM'}</span>
        {item.rating !== null && <span className="rating"><Star size={11} fill="currentColor" /> {item.rating.toFixed(1)}</span>}</div>
      <button className="quick-play" type="button" aria-label={`View ${item.title}`} onClick={e => { e.stopPropagation(); selectionMode && item.mediaType === 'movie' && onToggleSelect ? onToggleSelect(item) : onOpen(item); }}><Play size={16} fill="currentColor" /></button>
      <div className="poster-info"><h3>{item.title}</h3><p>{item.year || 'Release date TBA'} <span>·</span> {getLanguageLabel(item.language)}</p></div>
    </div>
    <a className="card-trailer" href={trailerUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
      <span className={`trailer-thumb ${!item.trailerThumb ? 'trailer-thumb-empty' : ''}`}>
  {item.trailerThumb ? (
    <>
      <img
        src={item.trailerThumb}
        alt=""
        loading="lazy"
        decoding="async"
      />
      <Play size={9} fill="currentColor" />
    </>
  ) : (
    <Play size={16} fill="currentColor" />
  )}
</span>
      <span>WATCH TRAILER</span><ArrowUpRight size={12} />
    </a>
    <div className="card-meta"><div className="provider-stack">{item.providers.length ? item.providers.slice(0, 3).map(p => p.logo
      ? <img key={p.id} src={p.logo} alt={p.name} title={p.name} />
      : <span key={p.id} title={p.name}>{p.name.slice(0, 1)}</span>) : <span className="provider-empty">No OTT data</span>}</div><span className="card-arrow"><ArrowUpRight size={15} /></span></div>
  </article>;
});

function DetailModal({ item, close, region, isWishlisted, onToggleWishlist }: { item: Title; close: () => void; region: string; isWishlisted: boolean; onToggleWishlist: (item: Title) => void }) {
  const [details, setDetails] = useState<FullDetails | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(true);
  const [expandedReviews, setExpandedReviews] = useState<string[]>([]);
  const trailer = item.trailerKey ? `https://www.youtube.com/watch?v=${item.trailerKey}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + ' official trailer')}`;

  useEffect(() => {
    const controller = new AbortController();
    setDetails(null);
    setDetailLoading(true);
    setDetailError('');

    fetch(`/api/details?type=${item.mediaType}&id=${item.id}&region=${region}`, {
      signal: controller.signal,
    })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Could not load title details');
        return data as FullDetails;
      })
      .then(data => setDetails(data))
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setDetailError(error instanceof Error ? error.message : 'Could not load full details.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });

    return () => controller.abort();
  }, [item.id, item.mediaType, region]);

  const line = (label: string, value?: string | number | null) => value !== undefined && value !== null && value !== ''
    ? <p className="detail-line"><strong>{label}:</strong> {value}</p> : null;

  return <div className="modal-backdrop" onMouseDown={close}>
    <section className="detail-modal" onMouseDown={e => e.stopPropagation()}>
      <button className="modal-close" onClick={close} aria-label="Close" type="button"><X size={18} /></button>
      <div className="modal-hero" style={item.backdrop ? { backgroundImage: `linear-gradient(90deg,rgba(8,9,13,.98),rgba(8,9,13,.58)),url(${item.backdrop})` } : {}}>
        <div className="modal-copy">
          <span className="eyebrow">{item.mediaType === 'tv' ? 'SERIES' : 'MOVIE'} · {item.year || 'Release date TBA'}</span>
          <h2>{item.title}</h2>
          <div className="modal-stats">{item.rating !== null && <span><Star size={14} fill="currentColor" /> {item.rating.toFixed(1)} / 10</span>}<span>{getLanguageLabel(item.language)}</span></div>
          <p>{item.overview || 'Synopsis not available yet.'}</p>
          <a className="primary-cta" href={trailer} target="_blank" rel="noreferrer"><Play size={15} fill="currentColor" /> Watch trailer on YouTube <ExternalLink size={14} /></a>
        </div>
      </div>
      <div className="modal-bottom"><div><span className="eyebrow">WHERE TO WATCH</span><h3>Available on your platforms</h3></div>
        {item.watchLink && <a className="provider-link" href={item.watchLink} target="_blank" rel="noreferrer">All options <ArrowUpRight size={14} /></a>}</div>
      {item.providers.length ? <div className="modal-providers">{item.providers.map(p => <a className="modal-provider" key={p.id}
          href={getProviderWatchUrl(p.name, item.title, item.watchLink)} target="_blank" rel="noopener noreferrer"
          aria-label={`Search for ${item.title} on ${p.name}`} title={`Find ${item.title} on ${p.name}`}>
          {p.logo && <img src={p.logo} alt="" />}<span>{p.name}</span><ExternalLink size={12} />
        </a>)}
        </div> : <p className="no-provider">No streaming availability was returned for this country. Try changing your region.</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, padding: '0 24px 18px' }}>
          <button type="button" aria-label={isWishlisted ? `Remove ${item.title} from wishlist` : `Add ${item.title} to wishlist`}
            onClick={() => onToggleWishlist(item)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 8, border: '1px solid rgba(255,255,255,.22)', background: 'rgba(8,9,13,.72)', color: isWishlisted ? '#DFFF00' : '#fff', cursor: 'pointer', fontWeight: 700 }}>
            <Heart size={16} fill={isWishlisted ? 'currentColor' : 'none'} /> {isWishlisted ? 'In Wishlist' : 'Add to Wishlist'}
          </button>
          <button type="button" aria-label={`Share ${item.title}`}
            onClick={async () => {
              const url = `https://www.themoviedb.org/${item.mediaType}/${item.id}`;
              try {
                if (navigator.share) await navigator.share({ title: item.title, text: `Discover ${item.title} on REELRADAR`, url });
                else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); window.alert('Title link copied to clipboard.'); }
                else window.prompt('Copy this title link:', url);
              } catch (error) {
                if (error instanceof Error && error.name !== 'AbortError') window.alert('Unable to share this title right now.');
              }
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 8, border: '1px solid rgba(255,255,255,.22)', background: 'rgba(8,9,13,.72)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
            <Share2 size={15} /> Share
          </button>
      </div>
      {item.trailerThumb && <a className="trailer-preview" href={trailer} target="_blank" rel="noreferrer"><img src={item.trailerThumb} alt="Trailer thumbnail" /><span className="trailer-play"><Play fill="currentColor" /></span><span>PLAY OFFICIAL TRAILER</span></a>}

      <div className="full-details">
        <div className="details-heading"><h3>Title information</h3><span>{detailLoading ? 'LOADING DETAILS…' : 'TMDB DETAILS'}</span></div>
        {detailError && <p className="no-provider">{detailError}</p>}
        {details && <>
          {line('Original title', details.originalTitle)}
          {line('Tagline', details.tagline)}
          {line('Director', details.director?.join(', '))}
          {line('Creator', details.creators?.join(', '))}
          {line('Genres', details.genres?.join(', '))}
          {line('Tags', details.keywords?.join(', '))}
          {line('Country', details.countries?.join(', '))}
          {line('Status', details.status)}
          {item.mediaType === 'tv' ? <>
            {line('Type', 'TV Series')}
            {line('Episodes', details.numberOfEpisodes)}
            {line('Seasons', details.numberOfSeasons)}
            {line('Aired', [details.firstAirDate, details.lastAirDate].filter(Boolean).join(' – '))}
            {line('Next episode', details.nextEpisode)}
            {line('Original network', details.networks?.join(', '))}
            {line('Episode duration', details.episodeRuntime ? `${details.episodeRuntime} min.` : null)}
            {line('Content rating', details.contentRating)}
          </> : <>
            {line('Release date', item.releaseDate)}
            {line('Runtime', details.runtime ? `${details.runtime} min.` : null)}
            {line('Budget', details.budget ? `$${details.budget.toLocaleString()}` : null)}
            {line('Box office', details.revenue ? `$${details.revenue.toLocaleString()}` : null)}
          </>}
          {line('Production companies', details.productionCompanies?.join(', '))}
          {line('Score', item.rating !== null ? `${item.rating.toFixed(1)} / 10 (${(details.voteCount ?? 0).toLocaleString()} votes)` : null)}
          {line('Popularity', typeof details.popularity === 'number' ? details.popularity.toFixed(1) : null)}
          {line('IMDb ID', details.imdbId)}
          {details.homepage && <p className="detail-line"><strong>Official website:</strong> <a href={details.homepage} target="_blank" rel="noreferrer">{details.homepage}</a></p>}
        </>}
        <div className="people-grid">
          <div><h4><Users size={15} /> Cast</h4>{details?.cast?.length ? details.cast.slice(0, 12).map(person =>
            <div className="person-row" key={person.id}>{person.profile && <img src={person.profile} alt="" loading="lazy" />}<span><strong>{person.name}</strong><small>{person.character}</small></span></div>
          ) : <p className="muted-note">Cast information unavailable.</p>}</div>
          <div><h4><Clapperboard size={15} /> Key crew</h4>{details?.crew?.length ? details.crew.slice(0, 12).map(person =>
            <div className="person-row" key={`${person.id}-${person.role}`} >{person.profile && <img src={person.profile} alt="" loading="lazy" />}<span><strong>{person.name}</strong><small>{person.role}</small></span></div>
          ) : <p className="muted-note">Crew information unavailable.</p>}</div>
        </div>
        <section className="reviews-section">
          <div className="details-heading"><h3>Audience reviews</h3><span>{details?.reviews?.length ? `${details.reviews.length} REVIEWS` : 'TMDB REVIEWS'}</span></div>
          {detailLoading ? <p className="muted-note">Loading reviews…</p> : details?.reviews?.length ? details.reviews.map(review => {
            const expanded = expandedReviews.includes(review.id);
            const content = review.content ?? '';
            const needsExpansion = content.length > 420;
            return <article className="review-card" key={review.id}>
              <div className="review-top"><div><strong>{review.author}</strong><small>{review.createdAt ? new Date(review.createdAt).toLocaleDateString() : 'Review'}</small></div>
                {typeof review.authorDetails?.rating === 'number' && <span className="review-rating"><Star size={12} fill="currentColor" /> {review.authorDetails.rating}/10</span>}</div>
              <p>{needsExpansion && !expanded ? `${content.slice(0, 420)}…` : content}</p>
              <div className="review-actions">{needsExpansion && <button type="button" onClick={() => setExpandedReviews(current => expanded ? current.filter(id => id !== review.id) : [...current, review.id])}>{expanded ? 'Read less' : 'Read more'}</button>}
                {review.url && <a href={review.url} target="_blank" rel="noreferrer">View on TMDB <ExternalLink size={12} /></a>}</div>
            </article>;
          }) : <p className="muted-note">No audience reviews are available for this title yet.</p>}
        </section>
      </div>
    </section>
  </div>;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('all');
  const [language, setLanguage] = useState('');
  const [region, setRegion] = useState('IN');
  useEffect(() => {
    const syncRegion = (event: Event) => { const value = (event as CustomEvent<string>).detail; if (value) setRegion(value); };
    try { setRegion(localStorage.getItem('reelradar-region') || 'IN'); } catch { /* Storage is optional. */ }
    window.addEventListener('reelradar-region-change', syncRegion);
    return () => window.removeEventListener('reelradar-region-change', syncRegion);
  }, []);
  const [filter, setFilter] = useState<DiscoveryFilter>('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Title[]>([]);
  const [featuredTitles, setFeaturedTitles] = useState<Title[]>([]);
  const [mobileFeaturedIndex, setMobileFeaturedIndex] = useState(0);
  const mobileTouchStartX = useRef<number | null>(null);
  const featuredTimerRef = useRef<number | null>(null);

  // Keep the coverflow timer outside React state to avoid touch-triggered renders.
  const scheduleFeaturedAdvance = useCallback(() => {
    if (featuredTimerRef.current !== null) {
      window.clearTimeout(featuredTimerRef.current);
      featuredTimerRef.current = null;
    }

    if (featuredTitles.length < 2 || mobileTouchStartX.current !== null) return;

    featuredTimerRef.current = window.setTimeout(() => {
      setMobileFeaturedIndex(current => (current + 1) % featuredTitles.length);
    }, 4000);
  }, [featuredTitles.length]);

  useEffect(() => {
    scheduleFeaturedAdvance();
    return () => {
      if (featuredTimerRef.current !== null) {
        window.clearTimeout(featuredTimerRef.current);
        featuredTimerRef.current = null;
      }
    };
  }, [scheduleFeaturedAdvance, mobileFeaturedIndex]);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(false);
  const [minimumSplashDone, setMinimumSplashDone] = useState(false);
  const [error, setError] = useState('');
  // Show the splash screen only on the first visit in this tab session.
useEffect(() => {
  const splashKey = 'reelradar-splash-shown';

  try {
    const alreadyShown = window.sessionStorage.getItem(splashKey);

    if (alreadyShown) return;

    window.sessionStorage.setItem(splashKey, 'true');
    setShowSplash(true);
  } catch {
    // If session storage is unavailable, show the splash normally.
    setShowSplash(true);
  }
}, []);



  const [selected, setSelected] = useState<Title | null>(null);
  const [availability, setAvailability] = useState<Availability>('all');
  const [genre, setGenre] = useState('');
  const [provider, setProvider] = useState('');
  const [platforms, setPlatforms] = useState<PlatformOption[]>([]);
  const [wishlist, setWishlist] = useState<Title[]>([]);
  const [wishlistReady, setWishlistReady] = useState(false);

  useEffect(() => {
    try {
      const pending = window.sessionStorage.getItem('reelradar-timeliner-open-title');
      if (!pending) return;
      window.sessionStorage.removeItem('reelradar-timeliner-open-title');
      const title = normalizeTitle(JSON.parse(pending));
      if (title) setSelected(title);
    } catch { /* Ignore an invalid one-time Timeliner handoff. */ }
  }, []);

  useEffect(() => {
    try {
      const pending = window.sessionStorage.getItem('reelradar-dropclock-open-title');
      if (!pending) return;
      window.sessionStorage.removeItem('reelradar-dropclock-open-title');
      const title = normalizeTitle(JSON.parse(pending));
      if (title) setSelected(title);
    } catch { /* Ignore an invalid one-time DropClock handoff. */ }
  }, []);

  useEffect(() => {
    try {
      const pending = window.sessionStorage.getItem('reelradar-actorlens-open-title');
      if (!pending) return;
      window.sessionStorage.removeItem('reelradar-actorlens-open-title');
      const title = normalizeTitle(JSON.parse(pending));
      if (title) setSelected(title);
    } catch { /* Ignore an invalid one-time ActorLens handoff. */ }
  }, []);

  useEffect(() => {
    let active = true;
    setProvider('');
    fetch(`/api/discover?providers=1&region=${encodeURIComponent(region)}`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load streaming platforms');
        const data = await response.json();
        if (active) setPlatforms(Array.isArray(data.providers) ? data.providers : []);
      })
      .catch(() => { if (active) setPlatforms([]); });
    return () => { active = false; };
  }, [region]);

 useEffect(() => {
  let active = true;

  const params = new URLSearchParams({
    type: 'all',
    language: '',
    region,
    query: '',
    filter: 'Trending Now',
    page: '1',
    availability: 'all',
    genre: '',
    provider: '',
    compact: '1',
  });

  fetch(`/api/discover?${params.toString()}`, {
    cache: 'no-store',
  })
    .then(async response => {
      if (!response.ok) {
        throw new Error('Could not load trending titles');
      }

      const data = await response.json();

      const trending = Array.isArray(data.results)
        ? data.results
            .map(normalizeTitle)
            .filter((item: Title | null): item is Title => item !== null)
        : [];

      if (active) {
        setFeaturedTitles(trending.slice(0, 5));
        setMobileFeaturedIndex(0);
      }
    })
    .catch(() => {
      if (active) setFeaturedTitles([]);
    });

  return () => {
    active = false;
  };
}, [region]);

  const [showWishlist, setShowWishlist] = useState(false);
  useEffect(() => {
    const show = () => { setShowWishlist(true); setPage(1); window.setTimeout(() => document.querySelector('.catalog-section')?.scrollIntoView({ behavior: 'smooth' }), 100); };
    if (new URLSearchParams(window.location.search).get('view') === 'watchlist') show();
    window.addEventListener('reelradar-show-wishlist', show);
    return () => window.removeEventListener('reelradar-show-wishlist', show);
  }, []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  useEffect(() => {
    const reset = () => { setMode('all'); setSearch(''); setQuery(''); setGenre(''); setShowWishlist(false); setPage(1); };
    window.addEventListener('reelradar-reset-home', reset);
    return () => window.removeEventListener('reelradar-reset-home', reset);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setWishlist(parsed.map(normalizeTitle).filter((x): x is Title => x !== null));
        }
      }
    } catch {
      setWishlist([]);
    } finally {
      setWishlistReady(true);
    }
  }, []);

  useEffect(() => {
    if (wishlistReady) {
      try { window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist)); }
      catch { /* Wishlist remains available for this session if storage is unavailable. */ }
    }
  }, [wishlist, wishlistReady]);

  const toggleWishlist = useCallback((item: Title) => {
    setWishlist(current => current.some(saved => saved.id === item.id && saved.mediaType === item.mediaType)
      ? current.filter(saved => !(saved.id === item.id && saved.mediaType === item.mediaType))
      : [item, ...current]);
  }, []);

  const wishlistKeys = useMemo(
    () => new Set(wishlist.map(item => `${item.mediaType}-${item.id}`)),
    [wishlist]
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        type: mode,
        language,
        region,
        query: search,
        filter,
        page: String(page),
        availability,
        genre,
        provider,
      });
      const res = await fetch(`/api/discover?${params.toString()}`, {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not load titles.');

      const safeItems: Title[] = Array.isArray(data.results)
        ? (data.results as unknown[])
            .map(normalizeTitle)
            .filter((x: Title | null): x is Title => x !== null)
        : [];

      setItems(safeItems);
      setTotalPages(Math.max(1, Number(data.totalPages) || 1));
      setTotalResults(Math.max(0, Number(data.totalResults) || safeItems.length));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setError(error instanceof Error ? error.message : 'Something went wrong.');
      setItems([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [mode, language, region, search, filter, page, availability, genre, provider]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!loading && showSplash) {
      const timer = window.setTimeout(() => setShowSplash(false), 500);
      return () => window.clearTimeout(timer);
    }
  }, [loading, showSplash]);
  const submitSearch = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setSearch(query.trim()); setPage(1); };
  const regionLabel = COUNTRIES.find(c => c.code === region)?.label ?? region;
  const availableGenres = mode === 'movie' ? MOVIE_GENRES : mode === 'tv' ? TV_GENRES : SHARED_GENRES;
  const displayedItems = showWishlist ? wishlist : items;
  const moveFeatured = useCallback((direction: number) => {
    if (featuredTitles.length < 2) return;
    setMobileFeaturedIndex(current =>
      (current + direction + featuredTitles.length) % featuredTitles.length
    );
  }, [featuredTitles.length]);

  const visibleFeaturedOffsets = useMemo(() => {
    const seen = new Set<number>();
    return [0, -1, 1, -2, 2]
      .filter(offset => {
        const itemIndex = (mobileFeaturedIndex + offset + featuredTitles.length) % featuredTitles.length;
        if (seen.has(itemIndex)) return false;
        seen.add(itemIndex);
        return true;
      })
      .sort((a, b) => a - b);
  }, [mobileFeaturedIndex, featuredTitles.length]);

  return <main className="site-shell">
    {showSplash && <div
      className="splash-screen"
      role="status"
      aria-label="Loading REELRADAR"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#08090d',
      }}
    >
      <div className="splash-brand-mark"><Clapperboard size={38} strokeWidth={1.7} /></div>
      <div className="splash-wordmark">REEL<span>RADAR</span></div>
      <div className="splash-loader"><span /></div>
      <p>PREPARING YOUR NEXT WATCH</p>
    </div>}
    

    <section className="intro rr-showcase-intro" id="top">
      <div className="intro-orb orb-one" /><div className="intro-orb orb-two" />
      <div className="intro-content rr-showcase-content">
        <div className="rr-showcase-heading">
          <div>
            <h1 className="rr-showcase-title">TRENDING NOW</h1>
          </div>
        </div>
        <div
          className="rr-featured-rail"
          aria-label="Popular movies and series. Swipe to explore."
          onTouchStart={event => {
            mobileTouchStartX.current = event.touches[0].clientX;
            if (featuredTimerRef.current !== null) {
              window.clearTimeout(featuredTimerRef.current);
              featuredTimerRef.current = null;
            }
          }}
          onTouchEnd={event => {
            const startX = mobileTouchStartX.current;
            if (startX === null) return;
            const delta = event.changedTouches[0].clientX - startX;
            mobileTouchStartX.current = null;
            if (Math.abs(delta) > 35) moveFeatured(delta < 0 ? 1 : -1);
            else scheduleFeaturedAdvance();
          }}
          onTouchCancel={() => {
            mobileTouchStartX.current = null;
            scheduleFeaturedAdvance();
          }}
        >
          {featuredTitles.length ? visibleFeaturedOffsets.map(offset => {
            const itemIndex = (mobileFeaturedIndex + offset + featuredTitles.length) % featuredTitles.length;
            const item = featuredTitles[itemIndex];
            const isWishlisted = wishlistKeys.has(`${item.mediaType}-${item.id}`);
            return <div
              className={`rr-featured-card rr-featured-card-${offset + 2} rr-featured-cover-card rr-cover-position-${offset + 2}`}
              key={`${item.mediaType}-${item.id}`}
              role="button"
              tabIndex={offset === 0 ? 0 : -1}
              aria-hidden={offset !== 0}
              onClick={() => {
                if (offset === 0) setSelected(item);
                else moveFeatured(offset);
              }}
              onKeyDown={event => {
                if (offset === 0 && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  setSelected(item);
                } else if (offset === 0 && event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveFeatured(-1);
                } else if (offset === 0 && event.key === 'ArrowRight') {
                  event.preventDefault();
                  moveFeatured(1);
                }
              }}
              aria-label={`${item.title}${offset === 0 ? ', selected title' : ', move to center'}`}
            >
              <span className="rr-featured-image">
                {item.poster || item.backdrop
                  ? <img
  src={item.poster || item.backdrop || ''}
  alt=""
  loading={offset === 0 ? 'eager' : 'lazy'}
  decoding="async"
  fetchPriority={offset === 0 ? 'high' : 'low'}
/>
                  : <span className="rr-featured-fallback"><Film size={30} /></span>}
              </span>
              <span className="rr-featured-shade" />
              <span className="rr-featured-glass" />
              <span className="rr-featured-topline">
                <span>{item.mediaType === 'tv' ? 'SERIES' : 'MOVIE'}</span>
                {item.rating !== null && <span><Star size={11} fill="currentColor" /> IMDb {item.rating.toFixed(1)}</span>}
              </span>
              <span className="rr-featured-copy">
                <strong>{item.title}</strong>
                <small>{item.year || 'Coming soon'} <span>·</span> {getLanguageLabel(item.language)}</small>
                <span className="rr-featured-actions">
                  <button type="button" className="rr-read-more" onClick={event => { event.stopPropagation(); setSelected(item); }}>READ MORE <ArrowUpRight size={13} /></button>
                  <button type="button" className={`rr-featured-wishlist ${isWishlisted ? 'is-saved' : ''}`} aria-label={isWishlisted ? `Remove ${item.title} from wishlist` : `Add ${item.title} to wishlist`} onClick={event => { event.stopPropagation(); toggleWishlist(item); }}><Heart size={19} fill={isWishlisted ? 'currentColor' : 'none'} /></button>
                </span>
              </span>
            </div>;
          }) : <div className="rr-featured-card rr-featured-skeleton" />}
        </div>
        <form className="searchbar" onSubmit={submitSearch}>
          <Search size={19} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search movies, series, documentaries…" />
          <button type="submit">Explore <ArrowUpRight size={15} /></button>
        </form>
        <div className="media-type-toggle-wrap">
          <div className="availability-toggle media-type-toggle" role="group" aria-label="Content type filter">
            {([['movie', 'MOVIES'], ['tv', 'SERIES'], ['documentary', 'DOCUMENTARIES']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={mode === value ? 'availability-active' : ''}
                aria-pressed={mode === value}
                onClick={() => { setMode(value); setSearch(''); setQuery(''); setGenre(''); setPage(1); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="intro-foot"><span><span className="live-dot" /> FRESH RELEASES</span><span>11 LANGUAGES</span><span>ONE DISCOVERY SPACE</span></div>
      </div>
    </section>
    <section className="catalog-section">
      <div className="section-heading"><div><div className="eyebrow">THE DISCOVERY FEED</div>
        <h2>{search ? `Results for “${search}”` : filter || 'All picks'}</h2>
        <p>Explore titles by mood and popularity. Streaming availability depends on your region.</p></div>
        <div className="result-count"><SlidersHorizontal size={15} /><span>{totalResults.toLocaleString()} TITLES</span></div>
      </div>

      <div className="filter-row">
        <div className="language-filters">
          <button className={!language ? 'filter-chip selected' : 'filter-chip'} onClick={() => { setLanguage(''); setPage(1); }} type="button">All languages</button>
          {LANGUAGES.map(l => <button key={l.code} className={language === l.code ? 'filter-chip selected' : 'filter-chip'} onClick={() => setLanguage(current => current === l.code ? '' : l.code)} type="button">{l.label}</button>)}
        </div>
        <div className="region-note"><Globe2 size={13} /> {regionLabel}</div>
      </div>
      <div className="desktop-discovery-controls">
        <div className="catalog-controls">
          <div className="availability-toggle" role="group" aria-label="Availability filter">
            {([['ott', 'OTT'], ['all', 'ALL'], ['theatre', 'THEATRE']] as const).map(([value, label]) =>
              <button key={value} type="button" className={availability === value ? 'availability-active' : ''} onClick={() => { setAvailability(value); setPage(1); }}>{label}</button>
            )}
          </div>
        </div>
        <div className="discovery-filter-wrap">
        <label htmlFor="discovery-filter">Browse by</label>
        <select id="discovery-filter" className="discovery-filter-select" value={filter} onChange={e => { setFilter(e.target.value as DiscoveryFilter); setPage(1); }}>
          <option value="">All picks</option>
          {DISCOVERY_FILTERS.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      <div className="discovery-filter-wrap">
        <label htmlFor="genre-filter">Genre</label>
        <select id="genre-filter" className="discovery-filter-select" value={genre} disabled={mode === 'documentary'}
          onChange={e => { setGenre(e.target.value); setPage(1); setShowWishlist(false); }}>
          <option value="">{mode === 'documentary' ? 'Documentaries only' : 'All genres'}</option>
          {availableGenres.slice(0, 8).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </div>
        <div className="discovery-filter-wrap">
          <label htmlFor="platform-filter">Streaming platform</label>
          <select id="platform-filter" className="discovery-filter-select" value={provider}
            onChange={e => { setProvider(e.target.value); setPage(1); setShowWishlist(false); }}>
            <option value="">All available platforms</option>
            {platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
          </select>
        </div>
      </div>
      {showWishlist ? (displayedItems.length === 0
        ? <div className="empty-state"><div className="empty-icon"><Heart size={25} /></div><h3>Your wishlist is empty</h3><p>Save movies and series with the heart button. Your list stays on this device and does not require an account.</p><button className="retry-button" onClick={() => setShowWishlist(false)} type="button">Explore titles</button></div>
        : <div className="poster-grid">{displayedItems.map(item => <Poster key={`${item.mediaType}-${item.id}`} item={item} onOpen={setSelected} />)}</div>)
        : loading ? <div className="loading-grid">{Array.from({ length: 10 }).map((_, i) => <div className="skeleton" key={i} />)}</div>
        : error ? <div className="empty-state"><div className="empty-icon"><Radio size={25} /></div><h3>Could not load titles</h3><p>{error}</p>
          <span>Check the TMDB environment variables and deployment logs.</span><button className="retry-button" onClick={() => void load()} type="button">Try again</button></div>
        : displayedItems.length === 0 ? <div className="empty-state"><div className="empty-icon"><Search size={25} /></div><h3>No titles found</h3><p>Try another language, filter or search term.</p>
          <button className="retry-button" onClick={() => { setLanguage(''); setSearch(''); setQuery(''); setFilter(''); setMode('all'); setAvailability('all'); setGenre(''); setProvider(''); setShowWishlist(false); setPage(1); }} type="button">Clear filters</button></div>
        : <><div className="poster-grid">{displayedItems.map(item => <Poster key={`${item.mediaType}-${item.id}`} item={item} onOpen={setSelected} />)}</div>
          <div className="pagination-wrap" aria-label="Pagination">
            <button type="button" disabled={page <= 1 || loading} onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: document.querySelector('.catalog-section')?.getBoundingClientRect().top ?? 0, behavior: 'smooth' }); }}>Previous</button>
            <div className="pagination-pages">
              {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
                const start = Math.max(1, Math.min(totalPages - 4, page - 2));
                const pageNumber = start + index;
                return <button key={pageNumber} type="button" className={pageNumber === page ? 'page-number page-current' : 'page-number'} disabled={loading} aria-current={pageNumber === page ? 'page' : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>;
              })}
            </div>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: document.querySelector('.catalog-section')?.getBoundingClientRect().top ?? 0, behavior: 'smooth' }); }}>Next <ArrowUpRight size={13} /></button>
          </div>
          <div className="feed-footer"><span>SHOWING {items.length} OF {totalResults.toLocaleString()} TITLES</span><span>UPDATED LIVE FROM TMDB <span className="live-dot" /></span></div></>}
    </section>

    
    {selected && <DetailModal item={selected} close={() => setSelected(null)} region={region} isWishlisted={wishlistKeys.has(`${selected.mediaType}-${selected.id}`)} onToggleWishlist={toggleWishlist} />}
  </main>;
}
