'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Clapperboard, Film, GitMerge, LoaderCircle, Search, Share2, Star, X } from 'lucide-react';
import './collide.css';

type Movie = {
  id: number; mediaType: 'movie' | 'tv'; title: string; overview: string;
  poster: string | null; backdrop: string | null; releaseDate: string; year: string;
  rating: number | null; language: string; genres: number[]; trailerKey: string | null;
  trailerThumb: string | null; providers: { id: number; name: string; logo: string | null }[]; watchLink: string | null;
};

type CollisionResult = {
  match: (Movie & { genreNames?: string[] }) | null;
  runnersUp: Movie[];
  reasonA: string[];
  reasonB: string[];
  collisionExplanation?: string;
  confidence?: number;
  aiUsed?: boolean;
  selected?: { id: number; title: string }[];
};


function normalizeMovie(value: unknown): Movie | null {
  if (!value || typeof value !== 'object') return null;
  const x = value as Partial<Movie>;
  if (typeof x.id !== 'number' || typeof x.title !== 'string') return null;
  return { id: x.id, mediaType: 'movie', title: x.title, overview: x.overview ?? '', poster: x.poster ?? null, backdrop: x.backdrop ?? null, releaseDate: x.releaseDate ?? '', year: x.year ?? '', rating: typeof x.rating === 'number' ? x.rating : null, language: x.language ?? '', genres: Array.isArray(x.genres) ? x.genres : [], trailerKey: x.trailerKey ?? null, trailerThumb: x.trailerThumb ?? null, providers: Array.isArray(x.providers) ? x.providers : [], watchLink: x.watchLink ?? null };
}

export default function MovieCollidePage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [loadingMovies, setLoadingMovies] = useState(true);
  const [movieError, setMovieError] = useState('');
  const [selected, setSelected] = useState<Movie[]>([]);
  const [collisionLoading, setCollisionLoading] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [collisionError, setCollisionError] = useState('');
  const [result, setResult] = useState<CollisionResult | null>(null);
  const [shareMessage, setShareMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMovies = useCallback(async (term: string) => {
    setLoadingMovies(true); setMovieError('');
    try {
      const params = new URLSearchParams({ type: 'movie', language: '', region: 'IN', query: term, filter: 'Trending Now', page: '1', availability: 'all', genre: '', provider: '' });
      const response = await fetch(`/api/discover?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not load movies.');
      setMovies(Array.isArray(data.results) ? data.results.map(normalizeMovie).filter((x: Movie | null): x is Movie => x !== null) : []);
    } catch (error) { setMovieError(error instanceof Error ? error.message : 'Could not load movies.'); setMovies([]); }
    finally { setLoadingMovies(false); }
  }, []);

  useEffect(() => { void loadMovies(''); }, [loadMovies]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const toggleMovie = (movie: Movie) => {
    setResult(null); setCollisionError(''); setShareMessage('');
    setSelected(current => current.some(x => x.id === movie.id) ? current.filter(x => x.id !== movie.id) : current.length < 2 ? [...current, movie] : [current[1], movie]);
  };

  const runCollision = async () => {
    if (selected.length !== 2 || collisionLoading) return;
    setCollisionLoading(true); setCollisionError(''); setResult(null); setAnimating(true);
    const animation = new Promise<void>(resolve => { timerRef.current = setTimeout(() => { setAnimating(false); resolve(); }, 3500); });
    try {
      const request = fetch('/api/collide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstId: selected[0].id, secondId: selected[1].id }) })
        .then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not find a collision match.'); return data as CollisionResult; });
      const [data] = await Promise.all([request, animation]);
      setResult(data); if (!data.match) setCollisionError('No strong match was found. Try two different movies.');
    } catch (error) { setCollisionError(error instanceof Error ? error.message : 'Movie Collide failed. Please try again.'); }
    finally { if (timerRef.current) clearTimeout(timerRef.current); setAnimating(false); setCollisionLoading(false); }
  };

  const share = async () => {
    if (!result?.match) return;
    const url = `https://www.themoviedb.org/movie/${result.match.id}`;
    const message = `REELRADAR Movie Collide: ${selected.map(x => x.title).join(' + ')} → ${result.match.title}`;
    try { if (navigator.share) await navigator.share({ title: 'Movie Collide', text: message, url }); else { await navigator.clipboard.writeText(`${message} ${url}`); setShareMessage('Match link copied.'); } }
    catch { setShareMessage('Sharing was cancelled or unavailable.'); }
  };

  return <main className="collide-page">
    
    <section className="collide-hero"><div className="hero-glow"/><span className="eyebrow"></span><h1><span>MOVIE</span> COLLIDE</h1><p>Two movies. One unexpected connection. Discover the film that sits between your favourites.</p><div className="hero-mark"><GitMerge size={25}/><span>SELECT TWO MOVIES TO BEGIN</span></div></section>
    <section className="collide-content">
      <div className="section-top"><div><span className="eyebrow">THE COLLISION LAB</span><h2>Choose your two movies</h2><p>Select any two films. We’ll find a movie that connects their cinematic DNA.</p></div><div className="selection-count">{selected.length}<span>/2 SELECTED</span></div></div>
      <form className="movie-search" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); void loadMovies(query.trim()); }}><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search for a movie…"/><button type="submit">Search <ArrowUpRight size={14}/></button></form>
      <div className="selected-strip">{[0,1].map(index => <div className={`selected-slot ${selected[index] ? 'filled' : ''}`} key={index}>{selected[index] ? <><img src={selected[index].poster ?? ''} alt=""/><span><small>MOVIE {index+1}</small><strong>{selected[index].title}</strong></span><button type="button" aria-label={`Remove ${selected[index].title}`} onClick={() => toggleMovie(selected[index])}><X size={15}/></button></> : <span className="empty-slot">{index+1} <small>Choose a movie</small></span>}</div>)}</div>
      <div className="selection-actions"><span>{selected.length === 2 ? 'Ready for the collision.' : `Select ${2-selected.length} more movie${2-selected.length === 1 ? '' : 's'}.`}</span><div><button className="clear-button" type="button" disabled={!selected.length || collisionLoading} onClick={() => { setSelected([]); setResult(null); setCollisionError(''); }}>Clear</button><button className="collide-button" type="button" disabled={selected.length !== 2 || collisionLoading} onClick={() => void runCollision()}><GitMerge size={16}/> COLLIDE</button></div></div>
      {collisionError && !collisionLoading && <p className="error-message" role="alert">{collisionError}</p>}
      {collisionLoading && !animating && <p className="waiting"><LoaderCircle className="spin" size={17}/> Finding the strongest connection…</p>}
      {animating && <div className="collision-stage" role="status"><div className="flying-poster left">{selected[0]?.poster && <img src={selected[0].poster} alt=""/>}</div><div className="impact"><i/><i/><i/></div><div className="flying-poster right">{selected[1]?.poster && <img src={selected[1].poster} alt=""/>}</div><strong>FINDING YOUR PERFECT MATCH</strong></div>}
      {result?.match && !collisionLoading && <section className="result-panel"><div className="result-main"><div className="result-poster">{result.match.poster && <img src={result.match.poster} alt={`${result.match.title} poster`}/>}</div><div><span className="eyebrow">YOUR COLLISION MATCH</span><h3>{result.match.title}</h3><p className="result-meta">{result.match.year || 'Year unavailable'} · {result.match.rating !== null ? `★ ${result.match.rating.toFixed(1)}` : 'Not rated'} · {result.match.genreNames?.join(' · ') || 'Movie'}</p><p>{result.match.overview || 'Overview unavailable.'}</p><a className="tmdb-link" href={`https://www.themoviedb.org/movie/${result.match.id}`} target="_blank" rel="noreferrer">View on TMDB <ArrowUpRight size={14}/></a></div></div>


<div className="collision-explanation">
  <div className="explanation-heading">
    <span className="explanation-icon">
      <GitMerge size={17} />
    </span>
    <div>
      <span className="eyebrow">
        {result.aiUsed
          ? 'GEMINI CINEMATIC ANALYSIS'
          : 'CINEMATIC ANALYSIS'}
      </span>
      <h4>Why these movies collided</h4>
    </div>
  </div>

  <p>
    {result.collisionExplanation ||
      'This movie connects the cinematic characteristics of both selected films.'}
  </p>

  {result.aiUsed && (
    <span className="ai-powered-label">
      <span />
      Powered by Gemini AI
    </span>
  )}
</div>



        <div className="why-match"><h4>Why this match</h4><div><strong>{selected[0]?.title}</strong><p>{result.reasonA?.join(' · ') || 'Shared cinematic themes and discovery signals'}</p></div><div><strong>{selected[1]?.title}</strong><p>{result.reasonB?.join(' · ') || 'Shared cinematic themes and discovery signals'}</p></div></div>
        {!!result.runnersUp?.length && <div className="runner-ups"><h4>More possible matches</h4><div>{result.runnersUp.map(movie => <a href={`https://www.themoviedb.org/movie/${movie.id}`} target="_blank" rel="noreferrer" key={movie.id}><span>{movie.poster && <img src={movie.poster} alt=""/>}</span><strong>{movie.title}</strong><small>{movie.year} {movie.rating !== null ? `· ★ ${movie.rating.toFixed(1)}` : ''}</small></a>)}</div></div>}
        <div className="result-actions"><button type="button" onClick={() => void runCollision()}>Collide again</button><button type="button" onClick={() => void share()}><Share2 size={15}/> Share match</button></div>{shareMessage && <p className="share-message" role="status">{shareMessage}</p>}</section>}
      <div className="movie-list-heading"><h3>{search ? `Search results for “${search}”` : 'Trending movies'}</h3><span>TMDB MOVIE DATABASE</span></div>
      {loadingMovies ? <div className="movie-grid">{Array.from({length:10},(_,i)=><div className="skeleton" key={i}/>)}</div> : movieError ? <p className="error-message">{movieError} <button type="button" onClick={() => void loadMovies(search)}>Retry</button></p> : <div className="movie-grid">{movies.map(movie => { const index = selected.findIndex(x => x.id === movie.id); return <button type="button" className={`movie-card ${index >= 0 ? 'chosen' : ''}`} key={movie.id} onClick={() => toggleMovie(movie)}><span className="poster">{movie.poster ? <img src={movie.poster} alt={`${movie.title} poster`} loading="lazy"/> : <Film size={26}/>}<i>{index >= 0 ? `SELECTED ${index+1}` : <GitMerge size={16}/>}</i></span><strong>{movie.title}</strong><small>{movie.year || 'Release date TBA'} {movie.rating !== null && <><span> · </span><Star size={11} fill="currentColor"/> {movie.rating.toFixed(1)}</>}</small></button>; })}</div>}
    </section>
    
  </main>;
}
