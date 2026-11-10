'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, Clapperboard, Dices, ExternalLink, Film, LoaderCircle, RotateCcw, Star, Volume2, VolumeX, X } from 'lucide-react';
import './roulette.css';

type MediaType = 'movie' | 'tv';
type Title = {
  id: number; mediaType: MediaType; title: string; overview: string; poster: string | null; backdrop: string | null;
  releaseDate: string; year: string; rating: number | null; language: string; genres: number[]; genreNames?: string[];
  trailerKey?: string | null; runtime?: number | null; seasons?: number | null;
  providers?: { id: number; name: string; logo: string | null }[]; watchLink?: string | null;
};
type Genre = { id: number; name: string };
const LANGUAGES = [
  ['en','English'],['hi','Hindi'],['ko','Korean'],['ja','Japanese'],['ta','Tamil'],['te','Telugu'],['ml','Malayalam'],['es','Spanish'],['fr','French'],['de','German'],['it','Italian'],['zh','Chinese'],['cn','Cantonese'],['th','Thai'],['id','Indonesian'],['pt','Portuguese'],['ru','Russian'],['ar','Arabic'],['tr','Turkish'],['sv','Swedish'],['fa','Persian'],['bn','Bengali'],['kn','Kannada'],['pa','Punjabi'],
];
const WISHLIST_KEY = 'reelradar-wishlist-v1';
const currentYear = new Date().getFullYear();

export default function MovieRoulettePage() {
  const [type, setType] = useState<'any' | 'movie' | 'tv' | 'documentary'>('any');
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [language, setLanguage] = useState('');
  const [rating, setRating] = useState(0);
  const [fromYear, setFromYear] = useState(0);
  const [toYear, setToYear] = useState(0);
  const [pool, setPool] = useState<Title[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Title | null>(null);
  const [zoomingWinnerKey, setZoomingWinnerKey] = useState<string | null>(null);
  const [history, setHistory] = useState<Title[]>([]);
  const [mute, setMute] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const dragRef = useRef<{ x: number; rotation: number; lastX: number; lastTime: number; velocity: number } | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const lastTickRef = useRef(-1);
  const spinTimerRef = useRef<number | null>(null);
  const detailCache = useRef<Map<string, Title>>(new Map());

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    let alive = true;
    const genreType = type === 'tv' ? 'tv' : type === 'any' ? 'any' : 'movie';
    fetch(`/api/roulette?action=genres&type=${genreType}`)
      .then(r => r.json()).then(d => { if (alive) setGenres(Array.isArray(d.genres) ? d.genres : []); })
      .catch(() => { if (alive) setGenres([]); });
    return () => { alive = false; };
  }, [type]);

  const filterKey = useMemo(() => JSON.stringify([type, selectedGenres, language, rating, fromYear, toYear]), [type, selectedGenres, language, rating, fromYear, toYear]);
  const loadPool = useCallback(async () => {
    setLoading(true); setError(''); setWinner(null);
    try {
      const params = new URLSearchParams({ action: 'pool', type, genres: selectedGenres.join(','), language, rating: String(rating), fromYear: String(fromYear), toYear: String(toYear) });
      const response = await fetch(`/api/roulette?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not find titles for these filters.');
      setPool(Array.isArray(data.titles) ? data.titles : []);
      setTotalResults(Number(data.totalResults) || 0);
      setRotation(value => value + 26);
    } catch (e) { setPool([]); setTotalResults(0); setError(e instanceof Error ? e.message : 'Something went wrong while loading titles.'); }
    finally { setLoading(false); }
  }, [filterKey]);

  useEffect(() => { const id = window.setTimeout(() => void loadPool(), 250); return () => window.clearTimeout(id); }, [loadPool]);

  useEffect(() => () => { if (spinTimerRef.current) window.clearTimeout(spinTimerRef.current); audioRef.current?.close().catch(() => undefined); }, []);

  const toggleGenre = (id: number) => setSelectedGenres(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const resetFilters = () => { setType('any'); setSelectedGenres([]); setLanguage(''); setRating(0); setFromYear(0); setToYear(0); };

  const playTick = useCallback(() => {
    if (mute) return;
    try {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = audioRef.current ?? new AudioCtor(); audioRef.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(1050, ctx.currentTime);
      gain.gain.setValueAtTime(0.035, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.04);
    } catch { /* Audio is optional; wheel remains usable without it. */ }
  }, [mute]);

  const reveal = useCallback(async (item: Title) => {
    const key = `${item.mediaType}-${item.id}`;
    let full = detailCache.current.get(key);
    if (!full) {
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/roulette?action=detail&type=${item.mediaType}&id=${item.id}`);
        const data = await response.json();
        if (response.ok) { full = data as Title; detailCache.current.set(key, full); }
      } catch { /* Keep the discover result as a usable fallback. */ }
      finally { setDetailLoading(false); }
    }
    const result = full ?? item;
    setWinner(result);
    setZoomingWinnerKey(null);
    setSpinning(false);
    setHistory(current => [result, ...current.filter(x => !(x.id === result.id && x.mediaType === result.mediaType))].slice(0, 6));
  }, []);

  const spin = useCallback((initialVelocity = 0) => {
    if (spinning || pool.length < 2) return;
    setWinner(null); setZoomingWinnerKey(null); setSpinning(true);
    const previous = history[0];
    const candidates = pool.filter(x => !(previous && x.id === previous.id && x.mediaType === previous.mediaType));
    const choice = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
    const index = pool.findIndex(x => x.id === choice.id && x.mediaType === choice.mediaType);
    const slice = 360 / pool.length;
    const start = rotation;
    // The carousel renderer centers a card when rotation modulo 360 equals
    // (360 - index * slice - slice / 2). Calculate the delta from the CURRENT
    // rotation to that exact angle; adding the target angle directly caused
    // the visual winner and the revealed winner to drift apart.
    const desiredAngle = ((360 - index * slice - slice / 2) % 360 + 360) % 360;
    const currentAngle = ((start % 360) + 360) % 360;
    const alignmentDelta = ((desiredAngle - currentAngle) % 360 + 360) % 360;
    const target = 360 * (5 + Math.floor(Math.random() * 3)) + alignmentDelta;
    const duration = reducedMotion ? 420 : 5600 + Math.min(900, Math.abs(initialVelocity) * 2);
    const end = start + target;
    const started = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    let previousSlice = -1;
    const frame = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const angle = start + (end - start) * ease(t);
      setRotation(angle);
      const currentSlice = Math.floor((((angle % 360) + 360) % 360) / slice);
      if (currentSlice !== previousSlice) { previousSlice = currentSlice; playTick(); }
      if (t < 1) requestAnimationFrame(frame);
      else {
        // Land exactly on the chosen title, hold it in the center, then zoom it forward
        // before opening the existing full result card.
        setRotation(end);
        setZoomingWinnerKey(`${choice.mediaType}-${choice.id}`);
        spinTimerRef.current = window.setTimeout(() => {
          void reveal(choice);
        }, reducedMotion ? 100 : 720);
      }
    };
    requestAnimationFrame(frame);
  }, [spinning, pool, history, rotation, reducedMotion, playTick, reveal]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (spinning || pool.length < 2) return;
    dragRef.current = { x: event.clientX, rotation, lastX: event.clientX, lastTime: performance.now(), velocity: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; if (!drag) return;
    const now = performance.now(); const dx = event.clientX - drag.lastX;
    drag.velocity = dx / Math.max(1, now - drag.lastTime); drag.lastX = event.clientX; drag.lastTime = now;
    setRotation(drag.rotation + (event.clientX - drag.x) * 0.9);
  };
  const onPointerUp = () => {
    const drag = dragRef.current; if (!drag) return;
    dragRef.current = null;
    const distance = Math.abs(rotation - drag.rotation);
    if (distance > 12 || Math.abs(drag.velocity) > 0.15) spin(Math.max(0, Math.abs(drag.velocity) * 1000));
  };

  const addToWatchlist = () => {
    if (!winner) return;
    try {
      const saved = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
      const entry = { ...winner, trailerThumb: winner.trailerKey ? `https://img.youtube.com/vi/${winner.trailerKey}/hqdefault.jpg` : null };
      if (!saved.some((x: any) => x.id === winner!.id && x.mediaType === winner!.mediaType)) localStorage.setItem(WISHLIST_KEY, JSON.stringify([...saved, entry]));
    } catch { /* Wishlist storage may be unavailable in private browsing. */ }
  };

  const sliceAngle = pool.length ? 360 / pool.length : 360;

  return <main className="roulette-page">
   
    

    <div className="roulette-heading"><span className="roulette-kicker">LET FATE PICK YOUR NEXT WATCH</span><h1>MOVIE ROULETTE</h1><p>Set your mood. Spin the wheel. Find your next obsession.</p></div>

    <div className="roulette-layout">
      <section className="roulette-stage">
        <div className="roulette-mobile-filter-panel">
          <FilterPanel {...{type,setType,genres,selectedGenres,toggleGenre,language,setLanguage,rating,setRating,fromYear,setFromYear,toYear,setToYear,resetFilters,totalResults,loading}} />
        </div>
        <div className={`roulette-card-stage ${spinning ? 'is-spinning' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="Movie roulette card carousel">
          <div className="roulette-stage-glow" />
          <div className="roulette-stage-scanline" />
          <div className="roulette-card-track">
            {pool.map((item, index) => {
              const targetAngle = ((360 - index * sliceAngle - sliceAngle / 2) % 360 + 360) % 360;
              const currentAngle = ((rotation % 360) + 360) % 360;
              const angleDiff = ((targetAngle - currentAngle + 540) % 360) - 180;
              const offset = angleDiff / sliceAngle;
              if (Math.abs(offset) > 3.15) return null;
              const distance = Math.abs(offset);
              const scale = Math.max(0.58, 1 - distance * 0.13);
              const opacity = Math.max(0.16, 1 - distance * 0.28);
              const isZoomingWinner = zoomingWinnerKey === `${item.mediaType}-${item.id}`;
              return <button key={`${item.mediaType}-${item.id}`} type="button" className={`roulette-movie-card ${distance < 0.18 ? 'is-centered' : ''} ${isZoomingWinner ? 'is-zooming-winner' : ''}`}
                style={{transform:isZoomingWinner ? 'translate(-50%,-50%) translateX(0) rotateY(0deg) scale(1.38)' : `translate(-50%,-50%) translateX(${offset * 174}px) rotateY(${-offset * 27}deg) scale(${scale})`,opacity:isZoomingWinner ? 1 : opacity,zIndex:isZoomingWinner ? 100 : Math.round(20-distance*4),filter:isZoomingWinner ? 'brightness(1.12)' : `brightness(${Math.max(0.38,1-distance*.2)})`}}
                onClick={() => { if (!spinning && distance < .55) void reveal(item); else if (!spinning) setRotation(rotation + angleDiff); }}
                tabIndex={distance < .55 ? 0 : -1} aria-label={item.title}>
                <span className="roulette-movie-poster">
                  {item.poster ? <img src={item.poster} alt="" draggable={false} loading="lazy"/> : <span className="roulette-poster-fallback"><Film size={34}/></span>}
                  <span className="roulette-poster-vignette"/><span className="roulette-card-index">{String(index+1).padStart(2,'0')}</span>
                  {item.rating !== null && <span className="roulette-card-rating"><Star size={11} fill="currentColor"/> {item.rating.toFixed(1)}</span>}
                </span>
                <span className="roulette-movie-info"><strong>{item.title}</strong><small>{item.year || 'YEAR TBA'} <i>·</i> {item.mediaType === 'tv' ? 'SERIES' : 'MOVIE'}</small></span>
              </button>;
            })}
          </div>
          <div className="roulette-carousel-centerline"/>
          <div className="roulette-carousel-caption"><span className="roulette-live-dot"/>{spinning ? 'SCANNING YOUR NEXT WATCH' : ''}</div>
        </div>
        {loading ? <p className="roulette-status"><span className="roulette-loading"><LoaderCircle size={16}/> Building your wheel…</span></p> : error ? <div className="roulette-empty roulette-error">{error}</div> : pool.length < 2 ? <div className="roulette-empty">No titles found for these filters. Try widening your year range or removing a genre.</div> : <>
          <button className="roulette-spin" type="button" disabled={spinning || loading} onClick={() => spin()}>{spinning ? 'SPINNING…' : <><Dices size={18}/> SPIN</>}</button>
          <div className="roulette-controls"><button className="roulette-mute" type="button" onClick={() => setMute(v => !v)}>{mute?<VolumeX size={15}/>:<Volume2 size={15}/>} {mute?'SOUND OFF':'SOUND ON'}</button></div>
          <p className="roulette-hint">Swipe or flick the cards to shuffle · {reducedMotion ? 'Reduced-motion mode enabled' : 'Let the carousel decide'}</p>
        </>}
      </section>

      <aside className="roulette-filters"><FilterPanel {...{type,setType,genres,selectedGenres,toggleGenre,language,setLanguage,rating,setRating,fromYear,setFromYear,toYear,setToYear,resetFilters,totalResults,loading}}/></aside>
    </div>

    <section className="roulette-history"><h3>RECENT SPINS</h3>{history.length ? <div className="roulette-history-list">{history.map(item=><div className="roulette-history-item" key={`${item.mediaType}-${item.id}`}><img src={item.poster ?? ''} alt=""/><span>{item.title}</span></div>)}</div> : <p className="roulette-hint" style={{textAlign:'left'}}>Your recent picks will appear here.</p>}</section>

    {winner && <div className="roulette-result-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setWinner(null)}}><section className="roulette-result" role="dialog" aria-modal="true" aria-label="Roulette winner">
      <button className="roulette-close" type="button" onClick={()=>setWinner(null)} aria-label="Close result"><X size={17}/></button>
      {winner.poster && <img src={winner.poster} alt={`${winner.title} poster`}/>}
      <div><span className="roulette-kicker">{detailLoading?'LOADING DETAILS':'THE WHEEL HAS SPOKEN'}</span><h2>{winner.title}</h2>
        <div className="roulette-result-meta"><span>{winner.year || 'Year TBA'}</span>{winner.rating!==null&&<span><Star size={11} fill="currentColor" style={{verticalAlign:'middle'}}/> {winner.rating.toFixed(1)}</span>}<span>{winner.mediaType==='tv'?'Series':'Movie'}</span><span>{winner.language?.toUpperCase() || '—'}</span></div>
        <div className="roulette-result-meta">{(winner.genreNames ?? []).map(g=><span key={g}>{g}</span>)}{winner.runtime ? <span>{winner.runtime} min</span> : winner.seasons ? <span>{winner.seasons} seasons</span> : null}</div>
        <p>{winner.overview || 'No overview is available for this title.'}</p>
        <div className="roulette-result-actions"><button className="primary" type="button" onClick={()=>spin()}> <RotateCcw size={13} style={{verticalAlign:'middle'}}/> Spin Again</button>
          {winner.trailerKey && <button type="button" onClick={()=>{const el=document.getElementById('roulette-trailer');el?.scrollIntoView({behavior:reducedMotion?'auto':'smooth'});}}>Watch Trailer</button>}
          <a href={winner.watchLink || `https://www.themoviedb.org/${winner.mediaType}/${winner.id}`} target="_blank" rel="noreferrer">View Details <ExternalLink size={12}/></a>
          <button type="button" onClick={addToWatchlist}><Check size={13} style={{verticalAlign:'middle'}}/> Add to Watchlist</button></div>
        {winner.providers?.length ? <><p style={{marginBottom:5,fontWeight:800}}>WHERE TO WATCH</p><div className="roulette-provider-row">{winner.providers.map(p=><a key={p.id} href={winner.watchLink || '#'} target="_blank" rel="noreferrer">{p.logo&&<img src={p.logo} alt=""/>}{p.name}</a>)}</div></>:<p style={{fontSize:10}}>Streaming provider availability was not returned for this title.</p>}
        {winner.trailerKey && <iframe id="roulette-trailer" className="roulette-trailer" src={`https://www.youtube-nocookie.com/embed/${winner.trailerKey}`} title={`${winner.title} trailer`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/>}
      </div>
    </section>
    
    </div>}

    
  </main>;
}

function FilterPanel(props: {
  type: 'any'|'movie'|'tv'|'documentary'; setType: (v:'any'|'movie'|'tv'|'documentary')=>void; genres: Genre[]; selectedGenres: number[]; toggleGenre:(id:number)=>void;
  language:string;setLanguage:(v:string)=>void;rating:number;setRating:(v:number)=>void;fromYear:number;setFromYear:(v:number)=>void;toYear:number;setToYear:(v:number)=>void;resetFilters:()=>void;totalResults:number;loading:boolean;
}) {
  const genreOptions = props.type === 'documentary' ? props.genres.filter(g=>g.id===99) : props.genres;
  return <div className="roulette-filter-card"><div className="roulette-filters-head"><h2>YOUR FILTERS</h2><button className="roulette-reset" type="button" onClick={props.resetFilters}>Reset filters</button></div>
    <div className="roulette-field"><label>TYPE</label><div className="roulette-type-row">{(['any','movie','tv','documentary'] as const).map(v=><button key={v} type="button" className={props.type===v?'active':''} onClick={()=>props.setType(v)}>{v==='any'?'Any':v==='tv'?'Series':v[0].toUpperCase()+v.slice(1)}</button>)}</div></div>
    <div className="roulette-field"><label>GENRES · MULTI-SELECT</label><div className="roulette-chips">{genreOptions.map(g=><button key={g.id} type="button" className={`roulette-chip ${props.selectedGenres.includes(g.id)?'active':''}`} onClick={()=>props.toggleGenre(g.id)}>{g.name}</button>)}{!genreOptions.length&&<span style={{fontSize:11,color:'#8f96a3'}}>Loading genres…</span>}</div></div>
    <div className="roulette-field"><label htmlFor="roulette-language">ORIGINAL LANGUAGE</label><select id="roulette-language" value={props.language} onChange={e=>props.setLanguage(e.target.value)}><option value="">Any language</option>{LANGUAGES.map(([code,name])=><option value={code} key={code}>{name}</option>)}</select></div>
    <div className="roulette-field"><label>MINIMUM RATING</label><div className="roulette-rating"><input type="range" min="0" max="9" step="0.5" value={props.rating} onChange={e=>props.setRating(Number(e.target.value))}/><strong>{props.rating ? `${props.rating.toFixed(1)}+` : 'Any'}</strong></div></div>
    <div className="roulette-field"><label>RELEASE YEAR RANGE</label><div className="roulette-range"><input aria-label="From year" type="number" min="1900" max={currentYear+2} placeholder="From" value={props.fromYear||''} onChange={e=>props.setFromYear(Math.max(0,Number(e.target.value)||0))}/><input aria-label="To year" type="number" min="1900" max={currentYear+2} placeholder="To" value={props.toYear||''} onChange={e=>props.setToYear(Math.max(0,Number(e.target.value)||0))}/></div></div>
    <div className="roulette-count">{props.loading?'Updating match count…':<><strong>{props.totalResults.toLocaleString()}</strong> titles match · wheel pool is sampled from up to 3 TMDB pages</>}</div>
  </div>;
}
