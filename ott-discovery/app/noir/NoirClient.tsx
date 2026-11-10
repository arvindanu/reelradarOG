'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Play, Film, Clock3, ExternalLink, X, ChevronLeft, ChevronRight } from 'lucide-react';

type ArchiveFilm = {
  identifier: string; title: string; year: string; creator: string;
  description: string; poster: string; rights: string; licenseUrl: string;
  detailsUrl: string; embedUrl: string; playable: boolean;
};
const CATEGORIES = [
  { label: 'All Classics', value: 'all' }, { label: 'Silent Era', value: 'silent' },
  { label: 'Film Noir', value: 'noir' }, { label: 'Classic Horror', value: 'horror' },
  { label: 'Early Cinema', value: 'early' },
];

export default function NoirClient() {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [searchText, setSearchText] = useState('');
  const [films, setFilms] = useState<ArchiveFilm[]>([]);
  const [selected, setSelected] = useState<ArchiveFilm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const loadFilms = useCallback(async (nextPage = 1) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ category, page: String(nextPage) });
      if (query.trim()) params.set('q', query.trim());
      const response = await fetch(`/api/noir?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load the archive right now.');
      setFilms(Array.isArray(data.films) ? data.films : []);
      setPage(nextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load the archive right now.');
      setFilms([]);
    } finally { setLoading(false); }
  }, [category, query]);

  useEffect(() => { void loadFilms(1); }, [loadFilms]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = oldOverflow; };
  }, [selected]);

  return <main className="noir-page">
    <section className="noir-hero">
      <div className="noir-film-grain" aria-hidden="true" />
      <div className="noir-hero-inner">
        <div className="noir-kicker"><span /> THE INTERNET ARCHIVE CINEMA COLLECTION</div>
        <h1>NOIR<span>.</span></h1>
        <p className="noir-tagline">A shadowy journey through cinema’s forgotten years.</p>
        <p className="noir-intro">Silent masterpieces, early cinema and classic films preserved in the Internet Archive. Discover a film, settle in, and watch it here.</p>
        <form className="noir-search" onSubmit={event => { event.preventDefault(); setQuery(searchText); }}>
          <Search size={18} /><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search the archive..." aria-label="Search archive films" />
          <button type="submit">SEARCH</button>
        </form>
      </div>
    </section>
    <section className="noir-library">
      <div className="noir-section-heading"><div><span className="noir-eyebrow">THE COLLECTION</span><h2>Explore the archive</h2></div><span className="noir-count"><Film size={15} /> PUBLIC ARCHIVE RESULTS</span></div>
      <div className="noir-categories" role="tablist" aria-label="Film categories">
        {CATEGORIES.map(item => <button key={item.value} type="button" role="tab" aria-selected={category === item.value} className={category === item.value ? 'active' : ''} onClick={() => setCategory(item.value)}>{item.label}</button>)}
      </div>
      {loading ? <div className="noir-loading-grid">{Array.from({ length: 8 }).map((_, i) => <div className="noir-skeleton" key={i} />)}</div>
        : error ? <div className="noir-message"><h3>Archive temporarily unavailable</h3><p>{error}</p><button type="button" onClick={() => void loadFilms(page)}>Try again</button></div>
        : films.length === 0 ? <div className="noir-message"><h3>No playable films found</h3><p>Try another category or search term.</p></div>
        : <div className="noir-grid">{films.map(film => <article className="noir-film-card" key={film.identifier}>
          <button type="button" className="noir-poster" onClick={() => setSelected(film)} aria-label={`Play ${film.title}`}>
            {film.poster ? <img src={film.poster} alt="" loading="lazy" /> : <span className="noir-poster-fallback"><Film size={34} /></span>}
            <span className="noir-play"><Play size={20} fill="currentColor" /></span><span className="noir-year">{film.year || 'CLASSIC'}</span>
          </button>
          <div className="noir-film-info"><h3>{film.title}</h3><p>{film.creator || 'Unknown filmmaker'}{film.year ? ` · ${film.year}` : ''}</p>
            <button type="button" className="noir-watch-link" onClick={() => setSelected(film)}><Play size={13} fill="currentColor" /> WATCH FILM</button>
            <a href={film.detailsUrl} target="_blank" rel="noreferrer">ARCHIVE DETAILS <ExternalLink size={11} /></a>
          </div>
        </article>)}</div>}
      <div className="noir-pagination"><button type="button" disabled={page <= 1 || loading} onClick={() => void loadFilms(page - 1)}><ChevronLeft size={16} /> PREVIOUS</button><span>PAGE {page}</span><button type="button" disabled={films.length === 0 || loading} onClick={() => void loadFilms(page + 1)}>NEXT <ChevronRight size={16} /></button></div>
      <p className="noir-rights-note">Films are hosted by the Internet Archive. Availability, playback and rights information are supplied by individual item records and may vary. Please check the rights statement on each archive item before reuse or redistribution.</p>
    </section>
    {selected && <div className="noir-player-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="noir-player-modal" role="dialog" aria-modal="true" aria-label={`Watch ${selected.title}`}>
        <div className="noir-player-head"><div><span>NOW SCREENING</span><h2>{selected.title}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Close player"><X size={21} /></button></div>
        <div className="noir-player-frame"><iframe src={selected.embedUrl} title={`Internet Archive player: ${selected.title}`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy" /></div>
        <div className="noir-player-meta"><span><Clock3 size={14} /> {selected.year || 'Year not listed'}</span><a href={selected.detailsUrl} target="_blank" rel="noreferrer">VIEW INTERNET ARCHIVE RECORD <ExternalLink size={12} /></a></div>
        <p className="noir-player-description">{selected.description || 'No description supplied by the archive.'}</p>
        <p className="noir-player-rights"><strong>Rights information:</strong> {selected.rights || selected.licenseUrl || 'No explicit rights statement found in the item metadata. Check the archive record before reuse.'}</p>
      </section>
    </div>}
  </main>;
}
