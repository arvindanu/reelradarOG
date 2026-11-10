'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowDownUp, ArrowLeft, ArrowUpRight, CalendarDays, ChevronDown,
  Clapperboard, Film, Instagram, LoaderCircle, ScanEye,
  Search, ShieldCheck, Sparkles, Star, Tv, Users, X, Youtube,
} from 'lucide-react';
import './actorlens.css';

type KnownFor = { id: number; mediaType: 'movie' | 'tv'; title: string; year: string; poster: string | null; rating: number | null };
type Actor = {
  id: number; name: string; photo: string | null; knownForDepartment: string;
  birthday: string | null; deathday: string | null; placeOfBirth: string | null; biography: string;
  knownFor: KnownFor[];
  externalIds: { imdbId: string | null; instagramId: string | null; twitterId: string | null; facebookId: string | null; tiktokId: string | null; youtubeId: string | null };
};
type Credit = {
  id: number; creditId: string; mediaType: 'movie' | 'tv'; title: string; overview: string;
  poster: string | null; year: string; releaseDate: string; rating: number | null;
  popularity: number; genreIds: number[]; character: string; job: string; department: string; creditType: 'cast' | 'crew';
};
type SearchPerson = { id: number; name: string; knownForDepartment: string; photo: string | null; knownFor: { title: string; mediaType: string; year: string }[] };
type ProfileResponse = { person: Actor; credits: { cast: Credit[]; crew: Credit[] } };
type Tab = 'all' | 'movie' | 'tv' | 'documentary';
type RoleMode = 'acting' | 'crew';

const GENRES: Record<number, string> = {
  12: 'Adventure', 14: 'Fantasy', 16: 'Animation', 18: 'Drama', 27: 'Horror', 28: 'Action',
  35: 'Comedy', 36: 'History', 37: 'Western', 53: 'Thriller', 80: 'Crime', 99: 'Documentary',
  878: 'Science Fiction', 9648: 'Mystery', 10402: 'Music', 10749: 'Romance', 10751: 'Family',
  10752: 'War', 10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 10770: 'TV Movie',
};
const NOISE_GENRES = new Set([10763, 10764, 10767]);
const NOISE_WORDS = /\b(talk show|news|award show|awards?|ceremony|red carpet|aftershow)\b/i;
const yearOf = (value?: string | null) => value && /^\d{4}/.test(value) ? Number(value.slice(0, 4)) : null;

function ageAt(birthday: string | null, deathday: string | null) {
  if (!birthday) return null;
  const born = new Date(`${birthday}T00:00:00`);
  const end = deathday ? new Date(`${deathday}T00:00:00`) : new Date();
  if (Number.isNaN(born.getTime())) return null;
  let age = end.getFullYear() - born.getFullYear();
  if (end.getMonth() < born.getMonth() || (end.getMonth() === born.getMonth() && end.getDate() < born.getDate())) age--;
  return age >= 0 ? age : null;
}

function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(value); return; }
    let frame = 0;
    const start = performance.now();
    const duration = 850;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(value * eased);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toFixed(decimals)}{suffix}</>;
}

function ActorPhoto({ src, name, large = false }: { src: string | null; name: string; large?: boolean }) {
  return <div className={`al-photo-frame ${large ? 'al-photo-large' : ''}`}>
    <div className="al-photo-orbit al-orbit-one" /><div className="al-photo-orbit al-orbit-two" />
    {src ? <img src={src} alt={name} /> : <div className="al-photo-fallback"><Users size={large ? 56 : 28} /><span>NO IMAGE</span></div>}
    <span className="al-photo-corner al-corner-tl" /><span className="al-photo-corner al-corner-tr" />
    <span className="al-photo-corner al-corner-bl" /><span className="al-photo-corner al-corner-br" />
    <span className="al-photo-scanline" />
  </div>;
}

export default function ActorLensClient({ actorId = null }: { actorId?: string | null }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchPerson[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [trending, setTrending] = useState<SearchPerson[]>([]);
  const [trendingError, setTrendingError] = useState('');
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [scanStage, setScanStage] = useState<'scanning' | 'confirmed' | 'done' | 'skipped'>('scanning');
  const [skipScan, setSkipScan] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [roleMode, setRoleMode] = useState<RoleMode>('acting');
  const [hideNoise, setHideNoise] = useState(true);
  const [sort, setSort] = useState('newest');
  const [decade, setDecade] = useState('all');
  const [genre, setGenre] = useState('all');
  const creditsRef = useRef<HTMLElement>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/actorlens?action=trending')
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load trending actors.'); return data; })
      .then(data => { if (active) setTrending(Array.isArray(data.results) ? data.results : []); })
      .catch(error => { if (active) setTrendingError(error instanceof Error ? error.message : 'Trending actors are unavailable.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (!value || actorId) { setSuggestions([]); setSearchLoading(false); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await fetch(`/api/actorlens?action=search&q=${encodeURIComponent(value)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Search is unavailable.');
        if (active) setSuggestions(Array.isArray(data.results) ? data.results : []);
      } catch { if (active) setSuggestions([]); }
      finally { if (active) setSearchLoading(false); }
    }, 260);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, actorId]);

  useEffect(() => {
    if (!actorId) { setProfile(null); setProfileLoading(false); setProfileError(''); return; }
    let active = true;
    setProfile(null); setProfileLoading(true); setProfileError('');
    setScanStage('scanning'); setSkipScan(false); setBioExpanded(false); setTab('all'); setRoleMode('acting');
    fetch(`/api/actorlens?action=profile&id=${encodeURIComponent(actorId)}`)
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load this actor.'); return data as ProfileResponse; })
      .then(data => { if (active) setProfile(data); })
      .catch(error => { if (active) setProfileError(error instanceof Error ? error.message : 'ActorLens could not load this profile.'); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [actorId]);

  useEffect(() => {
    if (!actorId || profileLoading || !profile) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || skipScan) { setScanStage('skipped'); return; }
    const confirmed = window.setTimeout(() => setScanStage('confirmed'), 1150);
    const done = window.setTimeout(() => setScanStage('done'), 2450);
    return () => { window.clearTimeout(confirmed); window.clearTimeout(done); };
  }, [actorId, profileLoading, profile, skipScan]);

  const selectActor = useCallback((id: number) => {
    setSuggestions([]); setQuery('');
    router.push(`/actorlens/${id}`);
  }, [router]);

  const credits = useMemo(() => {
    if (!profile) return [];
    const source = roleMode === 'acting' ? profile.credits.cast : profile.credits.crew;
    const unique = new Map<string, Credit>();
    for (const credit of source) {
      const key = `${credit.mediaType}-${credit.id}`;
      const existing = unique.get(key);
      if (!existing || (credit.creditType === 'cast' && existing.creditType !== 'cast')) unique.set(key, credit);
    }
    return [...unique.values()];
  }, [profile, roleMode]);

  const allUnique = useMemo(() => {
    if (!profile) return [];
    const unique = new Map<string, Credit>();
    [...profile.credits.cast, ...profile.credits.crew].forEach(credit => {
      const key = `${credit.mediaType}-${credit.id}`;
      if (!unique.has(key) || credit.creditType === 'cast') unique.set(key, credit);
    });
    return [...unique.values()];
  }, [profile]);

  const isDocumentary = (credit: Credit) => credit.genreIds.includes(99);
  const visibleCredits = useMemo(() => {
    let rows = credits.filter(credit => {
      if (tab === 'movie' && (credit.mediaType !== 'movie' || isDocumentary(credit))) return false;
      if (tab === 'tv' && (credit.mediaType !== 'tv' || isDocumentary(credit))) return false;
      if (tab === 'documentary' && !isDocumentary(credit)) return false;
      if (hideNoise && (/\b(self|himself|herself|themselves)\b/i.test(credit.character) || NOISE_WORDS.test(credit.title) || credit.genreIds.some(id => NOISE_GENRES.has(id)))) return false;
      if (decade !== 'all') { const y = yearOf(credit.year); if (!y || Math.floor(y / 10) * 10 !== Number(decade)) return false; }
      if (genre !== 'all' && !credit.genreIds.includes(Number(genre))) return false;
      if (activeYear !== null && yearOf(credit.year) !== activeYear) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === 'oldest') return (yearOf(a.year) ?? 9999) - (yearOf(b.year) ?? 9999) || a.title.localeCompare(b.title);
      if (sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1);
      if (sort === 'popularity') return b.popularity - a.popularity;
      return (yearOf(b.year) ?? 0) - (yearOf(a.year) ?? 0) || b.popularity - a.popularity;
    });
    return rows;
  }, [credits, tab, hideNoise, decade, genre, sort, activeYear]);

  const tabCounts = useMemo(() => {
    const base = credits.filter(credit => !(hideNoise && (/\b(self|himself|herself|themselves)\b/i.test(credit.character) || NOISE_WORDS.test(credit.title) || credit.genreIds.some(id => NOISE_GENRES.has(id)))));
    return {
      all: base.length,
      movie: base.filter(c => c.mediaType === 'movie' && !isDocumentary(c)).length,
      tv: base.filter(c => c.mediaType === 'tv' && !isDocumentary(c)).length,
      documentary: base.filter(isDocumentary).length,
    };
  }, [credits, hideNoise]);

  const stats = useMemo(() => {
    const clean = allUnique.filter(c => !(/\b(self|himself|herself|themselves)\b/i.test(c.character) || NOISE_WORDS.test(c.title) || c.genreIds.some(id => NOISE_GENRES.has(id))));
    const docs = clean.filter(isDocumentary);
    const movies = clean.filter(c => c.mediaType === 'movie' && !isDocumentary(c));
    const series = clean.filter(c => c.mediaType === 'tv' && !isDocumentary(c));
    const years = clean.map(c => yearOf(c.year)).filter((y): y is number => y !== null);
    const rated = clean.filter(c => typeof c.rating === 'number' && c.rating > 0);
    const highest = [...rated].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ?? null;
    return {
      movies: movies.length, series: series.length, docs: docs.length,
      years: years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—',
      average: rated.length ? rated.reduce((sum, c) => sum + (c.rating ?? 0), 0) / rated.length : 0,
      highest,
    };
  }, [allUnique]);

  const timeline = useMemo(() => {
    const counts = new Map<number, number>();
    allUnique.forEach(credit => { const year = yearOf(credit.year); if (year) counts.set(year, (counts.get(year) ?? 0) + 1); });
    const rows = [...counts.entries()].sort((a, b) => a[0] - b[0]);
    const max = Math.max(1, ...rows.map(row => row[1]));
    return rows.map(([year, count]) => ({ year, count, height: Math.max(7, count / max * 100) }));
  }, [allUnique]);

  const decades = useMemo(() => [...new Set(allUnique.map(c => yearOf(c.year)).filter((y): y is number => y !== null).map(y => Math.floor(y / 10) * 10))].sort((a, b) => b - a), [allUnique]);
  const genres = useMemo(() => [...new Set(allUnique.flatMap(c => c.genreIds))].filter(id => GENRES[id] && id !== 99).sort((a, b) => GENRES[a].localeCompare(GENRES[b])), [allUnique]);
  const actorAge = profile ? ageAt(profile.person.birthday, profile.person.deathday) : null;
  const tmdbProfile = profile?.person.externalIds;

  const openTitle = (credit: Credit) => {
    const item = {
      id: credit.id, mediaType: credit.mediaType, title: credit.title, overview: credit.overview,
      poster: credit.poster, backdrop: null, releaseDate: credit.releaseDate, year: credit.year,
      rating: credit.rating, language: '', genres: credit.genreIds, trailerKey: null, trailerThumb: null,
      providers: [], watchLink: null,
    };
    try { window.sessionStorage.setItem('reelradar-actorlens-open-title', JSON.stringify(item)); } catch { /* Navigation still works without the handoff. */ }
    window.location.assign('/');
  };

  const randomActor = () => {
    if (!trending.length) return;
    const candidate = trending[Math.floor(Math.random() * trending.length)];
    selectActor(candidate.id);
  };

  const shareProfile = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${profile?.person.name} · ActorLens`, text: `Explore ${profile?.person.name}'s filmography on ReelRadar ActorLens.`, url });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); window.alert('ActorLens profile link copied.'); }
      else window.prompt('Copy this ActorLens link:', url);
    } catch (error) { if (error instanceof Error && error.name !== 'AbortError') window.alert('Unable to share this profile right now.'); }
  };

  return <main className="actorlens-page">
    <div className="al-grid-bg" aria-hidden="true" />
   

    {!actorId ? <section className="al-landing">
      <div className="al-kicker"><span /> PERSONNEL DATABASE / 01</div>
      <h1>Every role.<br /><span>One lens.</span></h1>
      <p className="al-intro">ActorLens scans any actor and shows everything they've appeared in: movies, series, and documentaries, in one place.</p>
      <div className="al-search-wrap">
        <Search size={21} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search an actor, filmmaker, or performer…" aria-label="Search actors" />
        {searchLoading && <LoaderCircle className="al-spin" size={18} />}
        {query && <button type="button" className="al-clear-search" onClick={() => setQuery('')} aria-label="Clear search"><X size={17} /></button>}
        {suggestions.length > 0 && <div className="al-suggestions">{suggestions.map(person => <button type="button" key={person.id} onClick={() => selectActor(person.id)}>
          {person.photo ? <img src={person.photo} alt="" /> : <span className="al-suggestion-placeholder"><Users size={17} /></span>}
          <span className="al-suggestion-copy"><strong>{person.name}</strong><small>{person.knownForDepartment} · {person.knownFor.map(x => x.title).join(' · ') || 'Credits available'}</small></span>
          <ArrowUpRight size={16} />
        </button>)}</div>}
      </div>
      {query.trim().length > 1 && !searchLoading && suggestions.length === 0 && <p className="al-search-hint">No matches yet. Try another spelling or a shorter name.</p>}
      <div className="al-landing-actions"><button className="al-random-btn" type="button" onClick={randomActor} disabled={!trending.length}><Sparkles size={16} /> Random actor</button><span>OR SELECT A SIGNAL BELOW</span></div>
      <div className="al-section-heading"><div><span className="al-kicker">LIVE FROM THE DATABASE</span><h2>Trending actors</h2></div><span className="al-live-pill"><i /> THIS WEEK</span></div>
      {trending.length ? <div className="al-trending-grid">{trending.slice(0, 10).map((person, index) => <button type="button" className="al-trending-card" key={person.id} onClick={() => selectActor(person.id)}>
        <div className="al-trending-photo">{person.photo ? <img src={person.photo} alt={person.name} loading="lazy" /> : <Users size={28} />}<span className="al-trending-index">{String(index + 1).padStart(2, '0')}</span><span className="al-trending-open"><ArrowUpRight size={17} /></span></div>
        <strong>{person.name}</strong><small>{person.knownForDepartment}</small>
        {person.knownFor.length > 0 && <em>{person.knownFor.slice(0, 2).join(' · ')}</em>}
      </button>)}</div> : trendingError ? <div className="al-trending-empty">{trendingError}</div> : <div className="al-trending-grid al-trending-skeletons">{Array.from({ length: 10 }, (_, index) => <div className="al-trending-skeleton" key={index}><i /><b /><small /></div>)}</div>}
      <p className="al-tmdb-note"><img className="al-tmdb-wordmark" src="https://image.tmdb.org/t/p/w200/wwemzKWzjKYJFfCeiB57q3r4Bcm.svg" alt="TMDB" /> This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </section> : <section className="al-profile-shell">
      <div className="al-profile-toolbar"><Link href="/actorlens" className="al-back-link"><ArrowLeft size={15} /> ACTOR SEARCH</Link><button type="button" onClick={shareProfile} className="al-share-btn" disabled={!profile}><ArrowUpRight size={15} /> SHARE PROFILE</button></div>
      {profileLoading && <><div className="al-loading-state"><div className="al-loader-reticle"><ScanEye size={34} /></div><span>CONNECTING TO PERSONNEL DATABASE…</span><div className="al-loading-bar"><i /></div></div><div className="al-skeleton-grid">{Array.from({ length: 10 }, (_, index) => <div className="al-skeleton-card" key={index}><i /><b /><small /></div>)}</div></>}
      {profileError && <div className="al-error-state"><ShieldCheck size={30} /><h2>Signal not found</h2><p>{profileError}</p><Link href="/actorlens" className="al-primary-btn">Return to search</Link></div>}
      {profile && <>
        {scanStage !== 'done' && scanStage !== 'skipped' && <div className="al-scan-overlay" aria-live="polite">
          <div className="al-scan-grid" /><div className="al-scan-reticle"><span /><span /><span /><span /></div><div className="al-scan-sweep" />
          <div className="al-scan-text"><span>{scanStage === 'scanning' ? 'SCANNING…' : 'IDENTITY CONFIRMED'}</span><small>{scanStage === 'scanning' ? 'ANALYSING PERSONNEL SIGNATURE' : `SUBJECT ID / ${profile.person.id}`}</small></div>
          <button type="button" onClick={() => { setSkipScan(true); setScanStage('skipped'); }} className="al-skip-scan">SKIP SCAN <ArrowUpRight size={13} /></button>
        </div>}
        <div className={`al-profile-content ${scanStage === 'done' || scanStage === 'skipped' ? 'al-profile-visible' : 'al-profile-hidden'}`}>
          <div className="al-hero-profile">
            <div className="al-portrait-column"><ActorPhoto src={profile.person.photo} name={profile.person.name} large /><div className="al-portrait-caption"><span><i /> IDENTITY VERIFIED</span><small>SUBJECT #{String(profile.person.id).padStart(7, '0')}</small></div></div>
            <div className="al-identity-panel">
              <div className="al-kicker"><span /> PERSONNEL FILE / VERIFIED</div>
              <h1>{profile.person.name}</h1>
              <div className="al-identity-tags"><span>{profile.person.knownForDepartment || 'Entertainment'}</span><span>TMDB ID {profile.person.id}</span></div>
              <div className="al-bio-grid">
                {profile.person.birthday && <div><small>{profile.person.deathday ? 'BORN' : 'DATE OF BIRTH'}</small><strong>{new Date(`${profile.person.birthday}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>}
                {actorAge !== null && <div><small>{profile.person.deathday ? 'AGE AT DEATH' : 'AGE'}</small><strong>{actorAge} years</strong></div>}
                {profile.person.placeOfBirth && <div className="al-born-place"><small>PLACE OF BIRTH</small><strong>{profile.person.placeOfBirth}</strong></div>}
              </div>
              <div className="al-biography"><p className={bioExpanded ? '' : 'al-bio-clamped'}>{profile.person.biography || 'No biography has been added to the TMDB profile for this person yet.'}</p>{profile.person.biography.length > 230 && <button type="button" onClick={() => setBioExpanded(value => !value)}>{bioExpanded ? 'READ LESS' : 'READ MORE'} <ChevronDown size={13} className={bioExpanded ? 'al-chevron-up' : ''} /></button>}</div>
              {profile.person.knownFor.length > 0 && <div className="al-known-for"><small>KNOWN FOR</small><div>{profile.person.knownFor.slice(0, 5).map(item => <button type="button" key={`${item.mediaType}-${item.id}`} onClick={() => openTitle({ ...item, creditId: `${item.id}`, overview: '', releaseDate: item.year, popularity: 0, genreIds: [], character: '', job: '', department: '', creditType: 'cast' })}><span>{item.title}</span>{item.year && <em>{item.year}</em>}</button>)}</div></div>}
              <div className="al-social-links">
                {tmdbProfile?.imdbId && <a href={`https://www.imdb.com/name/${tmdbProfile.imdbId}/`} target="_blank" rel="noreferrer">IMDb <ArrowUpRight size={12} /></a>}
                {tmdbProfile?.instagramId && <a href={`https://www.instagram.com/${tmdbProfile.instagramId}/`} target="_blank" rel="noreferrer"><Instagram size={13} /> Instagram</a>}
                {tmdbProfile?.twitterId && <a href={`https://x.com/${tmdbProfile.twitterId}`} target="_blank" rel="noreferrer">𝕏 <span>Twitter</span></a>}
                {tmdbProfile?.facebookId && <a href={`https://www.facebook.com/${tmdbProfile.facebookId}`} target="_blank" rel="noreferrer">Facebook <ArrowUpRight size={12} /></a>}
                {tmdbProfile?.tiktokId && <a href={`https://www.tiktok.com/@${tmdbProfile.tiktokId}`} target="_blank" rel="noreferrer">TikTok <ArrowUpRight size={12} /></a>}
                {tmdbProfile?.youtubeId && <a href={`https://www.youtube.com/${tmdbProfile.youtubeId}`} target="_blank" rel="noreferrer"><Youtube size={13} /> YouTube</a>}
              </div>
            </div>
          </div>

          <section className="al-stats-grid" aria-label="Career statistics">
            <div className="al-stat-tile"><span><Film size={15} /> MOVIES</span><strong><CountUp value={stats.movies} /></strong><small>FEATURE FILMS</small></div>
            <div className="al-stat-tile"><span><Tv size={15} /> SERIES</span><strong><CountUp value={stats.series} /></strong><small>TV CREDITS</small></div>
            <div className="al-stat-tile"><span><Clapperboard size={15} /> DOCUMENTARIES</span><strong><CountUp value={stats.docs} /></strong><small>DOC TITLES</small></div>
            <div className="al-stat-tile"><span><CalendarDays size={15} /> YEARS ACTIVE</span><strong className="al-stat-years">{stats.years}</strong><small>RELEASE TIMELINE</small></div>
            <div className="al-stat-tile"><span><Star size={15} /> AVG. RATING</span><strong><CountUp value={stats.average} decimals={1} /><small className="al-out-of"> / 10</small></strong><small>TMDB USER SCORE</small></div>
            <div className="al-stat-tile al-highest-stat"><span><Activity size={15} /> HIGHEST RATED</span><strong>{stats.highest ? stats.highest.rating?.toFixed(1) : '—'}<small className="al-out-of"> / 10</small></strong><small title={stats.highest?.title}>{stats.highest?.title ?? 'NO RATING DATA'}</small></div>
          </section>

          {profile.person.knownFor.length > 0 && <section className="al-known-strip"><div className="al-section-heading"><div><span className="al-kicker">SIGNATURE APPEARANCES</span><h2>Top known-for titles</h2></div></div><div className="al-known-cards">{profile.person.knownFor.slice(0, 5).map(item => <button type="button" key={`known-${item.mediaType}-${item.id}`} onClick={() => openTitle({ ...item, creditId: `${item.id}`, overview: '', releaseDate: item.year, popularity: 0, genreIds: [], character: '', job: '', department: '', creditType: 'cast' })}><div>{item.poster ? <img src={item.poster} alt="" loading="lazy" /> : <span className="al-poster-placeholder"><Film /></span>}<span className="al-known-rating">{item.rating ? `★ ${item.rating.toFixed(1)}` : 'TMDB'}</span></div><strong>{item.title}</strong><small>{item.year || 'Release date unknown'}</small></button>)}</div></section>}

          {timeline.length > 0 && <section className="al-timeline-section"><div className="al-section-heading"><div><span className="al-kicker">CAREER ACTIVITY</span><h2>Career timeline</h2></div><span className="al-timeline-hint">SELECT A YEAR TO FILTER CREDITS</span></div><div className="al-timeline-chart">{timeline.map(point => <button type="button" key={point.year} className={activeYear === point.year ? 'al-year-active' : ''} title={`${point.year}: ${point.count} titles`} onClick={() => { setActiveYear(current => current === point.year ? null : point.year); setTab('all'); creditsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span className="al-year-count">{point.count}</span><i style={{ height: `${point.height}%` }} /><small>{point.year}</small></button>)}</div>{activeYear !== null && <button type="button" className="al-clear-year" onClick={() => setActiveYear(null)}>CLEAR YEAR FILTER <X size={12} /></button>}</section>}

          <section className="al-credits-section" id="credits-list" ref={creditsRef}>
            <div className="al-section-heading al-credits-heading"><div><span className="al-kicker">COMPLETE PERSONNEL RECORD</span><h2>Filmography <span>{visibleCredits.length}</span></h2></div><div className="al-role-switch"><button type="button" className={roleMode === 'acting' ? 'active' : ''} onClick={() => setRoleMode('acting')}>ACTING</button><button type="button" className={roleMode === 'crew' ? 'active' : ''} onClick={() => setRoleMode('crew')}>DIRECTING, WRITING & OTHER</button></div></div>
            <div className="al-credit-tabs">{([['all', 'ALL'], ['movie', 'MOVIES'], ['tv', 'SERIES'], ['documentary', 'DOCUMENTARIES']] as [Tab, string][]).map(([key, label]) => <button type="button" key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}<span>{tabCounts[key]}</span></button>)}</div>
            <div className="al-filters"><label><ArrowDownUp size={14} /><select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort credits"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="rating">Highest rating</option><option value="popularity">Most popular</option></select></label><label><CalendarDays size={14} /><select value={decade} onChange={event => { setDecade(event.target.value); setActiveYear(null); }} aria-label="Filter by decade"><option value="all">All decades</option>{decades.map(value => <option key={value} value={value}>{value}s</option>)}</select></label><label><Clapperboard size={14} /><select value={genre} onChange={event => setGenre(event.target.value)} aria-label="Filter by genre"><option value="all">All genres</option>{genres.map(value => <option key={value} value={value}>{GENRES[value]}</option>)}</select></label><label className="al-noise-toggle"><input type="checkbox" checked={hideNoise} onChange={event => setHideNoise(event.target.checked)} /><span className="al-toggle-ui" /><span>Hide talk shows & self appearances</span></label></div>
            {visibleCredits.length ? <div className="al-credit-grid">{visibleCredits.map((credit, index) => <button type="button" className="al-credit-card" key={`${credit.mediaType}-${credit.id}-${credit.creditType}`} style={{ animationDelay: `${Math.min(index % 12, 11) * 35}ms` }} onClick={() => openTitle(credit)}>
              <div className="al-credit-poster">{credit.poster ? <img src={credit.poster} alt="" loading="lazy" /> : <div className="al-poster-placeholder"><Film size={27} /><span>NO ARTWORK</span></div>}<span className={`al-media-badge ${credit.mediaType === 'tv' ? 'tv' : 'movie'}`}>{isDocumentary(credit) ? 'DOC' : credit.mediaType === 'tv' ? 'SERIES' : 'MOVIE'}</span><span className="al-card-open"><ArrowUpRight size={17} /></span></div>
              <div className="al-credit-info"><strong>{credit.title}</strong><div className="al-credit-meta"><span>{credit.year || 'Year unknown'}</span>{credit.rating !== null && credit.rating > 0 && <span><Star size={11} fill="currentColor" /> {credit.rating.toFixed(1)}</span>}</div><small>{roleMode === 'acting' ? (credit.character ? `as ${credit.character}` : 'Acting credit') : (credit.job || credit.department || 'Crew credit')}</small></div>
            </button>)}</div> : <div className="al-empty-credits"><ScanEye size={28} /><h3>No credits in this view</h3><p>Try another tab, role type, or filter. TMDB may not have a complete credit record for this person.</p><button type="button" onClick={() => { setTab('all'); setRoleMode('acting'); setDecade('all'); setGenre('all'); setActiveYear(null); setHideNoise(false); }}>RESET FILTERS</button></div>}
          </section>
         
        </div>
      </>}
    </section>}

    
  </main>;
}
