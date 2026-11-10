
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import './bingeclock.css';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, Clapperboard, Clock3, Film, Hourglass, Search, Share2, Sparkles, Tv, X } from 'lucide-react';

type Mode = 'collection' | 'series';
type SearchItem = { id: number; title: string; overview: string; poster: string | null; backdrop: string | null; year: string; mediaType: string };
type WatchItem = { id: number; key: string; title: string; label: string; runtime: number; releaseDate: string; poster: string | null; type: 'movie' | 'episode' };
type PlanData = { selection: { id: number; type: Mode; title: string; poster: string | null; overview: string }; items: WatchItem[]; missingRuntimeCount: number; stats: { seasons: number; titles: number; totalMinutes: number; averageMinutes: number } };
type DayPlan = { date: string; items: WatchItem[]; minutes: number };

const PROGRESS_PREFIX = 'reelradar-bingeclock-v1';
const WEEKDAYS = [{ label: 'Mon', value: 1 }, { label: 'Tue', value: 2 }, { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 }, { label: 'Sun', value: 0 }];
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (value: string, amount: number) => { const date = parseDate(value); date.setDate(date.getDate() + amount); return localDate(date); };
const prettyDate = (value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => parseDate(value).toLocaleDateString(undefined, options);
const formatTime = (minutes: number) => { const hours = Math.floor(minutes / 60); const mins = minutes % 60; return hours ? `${hours}h ${mins ? `${mins}m` : ''}`.trim() : `${mins}m`; };

function buildSchedule(items: WatchItem[], start: string, deadline: string, dailyMinutes: number, excluded: number[]) {
  const days: DayPlan[] = [];
  let cursor = 0;
  let date = start;
  let guard = 0;
  while (cursor < items.length && date <= deadline && guard++ < 4000) {
    const weekday = parseDate(date).getDay();
    if (!excluded.includes(weekday)) {
      const dayItems: WatchItem[] = [];
      let minutes = 0;
      while (cursor < items.length) {
        const next = items[cursor];
        if (dayItems.length && minutes + next.runtime > dailyMinutes) break;
        dayItems.push(next);
        minutes += next.runtime;
        cursor++;
        if (minutes >= dailyMinutes) break;
      }
      if (dayItems.length) days.push({ date, items: dayItems, minutes });
    }
    date = addDays(date, 1);
  }
  const deadlineDays = days.length;
  while (cursor < items.length && guard++ < 8000) {
    const weekday = parseDate(date).getDay();
    if (!excluded.includes(weekday)) {
      const dayItems: WatchItem[] = [];
      let minutes = 0;
      while (cursor < items.length) {
        const next = items[cursor];
        if (dayItems.length && minutes + next.runtime > dailyMinutes) break;
        dayItems.push(next); minutes += next.runtime; cursor++;
        if (minutes >= dailyMinutes) break;
      }
      if (dayItems.length) days.push({ date, items: dayItems, minutes });
    }
    date = addDays(date, 1);
  }
  return { days, deadlineDays, complete: cursor === items.length };
}

function encodeShare(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decodeShare(value: string) {
  try { const normalized = value.replace(/-/g, '+').replace(/_/g, '/'); const binary = atob(normalized); const bytes = Uint8Array.from(binary, char => char.charCodeAt(0)); return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

export default function BingeClockPage() {
  const today = useMemo(() => localDate(new Date()), []);
  const [mode, setMode] = useState<Mode>('collection');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selection, setSelection] = useState<SearchItem | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [deadline, setDeadline] = useState(addDays(today, 14));
  const [dailyHours, setDailyHours] = useState(2);
  const [excludedDays, setExcludedDays] = useState<number[]>([]);
  const [skipSpecials, setSkipSpecials] = useState(true);
  const [skipUnaired, setSkipUnaired] = useState(true);
  const [howOpen, setHowOpen] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [progressReady, setProgressReady] = useState(false);
  const [shareNotice, setShareNotice] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('share');
    if (!shared) return;
    const data = decodeShare(shared);
    if (!data || !Number.isInteger(data.id)) return;
    setMode(data.type === 'series' ? 'series' : 'collection');
    setDeadline(typeof data.deadline === 'string' ? data.deadline : addDays(today, 14));
    setDailyHours(Math.min(12, Math.max(1, Number(data.dailyHours) || 2)));
    setExcludedDays(Array.isArray(data.excludedDays) ? data.excludedDays : []);
    setSkipSpecials(data.skipSpecials !== false);
    setSkipUnaired(data.skipUnaired !== false);
    const sharedSelection: SearchItem = { id: data.id, title: data.title || 'Shared watch plan', overview: '', poster: data.poster || null, backdrop: null, year: '', mediaType: data.type === 'series' ? 'tv' : 'collection' };
    setSelection(sharedSelection);
    window.history.replaceState({}, '', '/bingeclock');
  }, [today]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || selection) { setResults([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true); setSearchError('');
      try {
        const response = await fetch(`/api/bingeclock?type=${mode}&query=${encodeURIComponent(term)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Search is temporarily unavailable.');
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch (error) {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : 'Could not search TMDB.');
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 320);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, mode, selection]);

  const loadPlan = useCallback(async (selected: SearchItem) => {
    setLoadingPlan(true); setPlanError(''); setPlan(null); setDone([]); setProgressReady(false);
    try {
      const response = await fetch('/api/bingeclock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: mode, id: selected.id, skipSpecials, skipUnaired }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not build this watch plan.');
      setPlan(data as PlanData);
    } catch (error) { setPlanError(error instanceof Error ? error.message : 'TMDB could not finish loading this plan.'); }
    finally { setLoadingPlan(false); }
  }, [mode, skipSpecials, skipUnaired]);

  useEffect(() => { if (selection) void loadPlan(selection); }, [selection, loadPlan]);

  const progressKey = plan ? `${PROGRESS_PREFIX}:${plan.selection.type}:${plan.selection.id}` : '';
  useEffect(() => {
    if (!progressKey || !plan) return;
    try {
      const stored = localStorage.getItem(progressKey);
      setDone(stored ? JSON.parse(stored) : []);
    } catch { setDone([]); }
    setProgressReady(true);
  }, [progressKey, plan]);
  useEffect(() => {
    if (progressReady && progressKey) { try { localStorage.setItem(progressKey, JSON.stringify(done)); } catch { /* Keep progress for this session if storage is unavailable. */ } }
  }, [done, progressKey, progressReady]);

  const schedule = useMemo(() => plan ? buildSchedule(plan.items, startDate, deadline, dailyHours * 60, excludedDays) : null, [plan, startDate, deadline, dailyHours, excludedDays]);
  const availableDays = useMemo(() => {
    if (deadline < startDate) return 0;
    let count = 0;
    for (let date = startDate, guard = 0; date <= deadline && guard < 4000; date = addDays(date, 1), guard++) if (!excludedDays.includes(parseDate(date).getDay())) count++;
    return count;
  }, [startDate, deadline, excludedDays]);
  const totalMinutes = plan?.stats.totalMinutes ?? 0;
  const requiredHours = availableDays ? totalMinutes / availableDays / 60 : Infinity;
  const deadlineSchedule = schedule?.days.filter(day => day.date <= deadline) ?? [];
  const scheduledCount = deadlineSchedule.reduce((sum, day) => sum + day.items.length, 0);
  const scheduleOverLimit = deadlineSchedule.some(day => day.minutes > dailyHours * 60);
  const achievable = Boolean(plan && availableDays > 0 && scheduledCount >= plan.items.length && !scheduleOverLimit);
  const finishDay = schedule?.days.find(day => day.items.some(item => item.key === plan?.items[plan.items.length - 1]?.key))?.date ?? null;
  const bufferDays = finishDay && deadline >= finishDay ? Math.round((parseDate(deadline).getTime() - parseDate(finishDay).getTime()) / 86400000) : 0;
  const utilization = Number.isFinite(requiredHours) && dailyHours ? requiredHours / dailyHours : Infinity;
  const feasibility = !achievable ? 'Not possible' : utilization < .5 ? 'Easy' : utilization < .75 ? 'Comfortable' : 'Tight';
  const completedCount = plan ? plan.items.filter(item => done.includes(item.key)).length : 0;
  const progressPercent = plan?.items.length ? Math.round(completedCount / plan.items.length * 100) : 0;
  const paceCount = availableDays ? Math.ceil((plan?.items.length ?? 0) / availableDays) : 0;
  const headline = plan ? (mode === 'series' ? `Watch ${paceCount} ${paceCount === 1 ? 'episode' : 'episodes'} a day` : `Watch ${paceCount} ${paceCount === 1 ? 'movie' : 'movies'} a day`) : '';

  const selectItem = (item: SearchItem) => { setSelection(item); setQuery(''); setResults([]); };
  const resetSelection = () => { setSelection(null); setPlan(null); setPlanError(''); setQuery(''); setResults([]); };
  const toggleDone = (key: string) => setDone(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key]);
  const sharePlan = async () => {
    if (!plan) return;
    const payload = { id: plan.selection.id, type: plan.selection.type, title: plan.selection.title, poster: plan.selection.poster, deadline, dailyHours, excludedDays, skipSpecials, skipUnaired };
    const url = `${window.location.origin}/bingeclock?share=${encodeShare(payload)}`;
    const text = `${plan.selection.title} BingeClock plan: ${headline}, ${formatTime(totalMinutes)} total. Finish by ${prettyDate(deadline, { month: 'short', day: 'numeric', year: 'numeric' })}.`;
    try {
      if (navigator.share) await navigator.share({ title: `${plan.selection.title} · BingeClock`, text, url });
      else { await navigator.clipboard.writeText(url); setShareNotice('Share link copied.'); }
    } catch (error) { if (error instanceof Error && error.name !== 'AbortError') setShareNotice('Could not share right now.'); }
  };
  const addCalendar = () => {
    if (!schedule || !plan) return;
    const events = schedule.days.map(day => {
      const title = `${plan.selection.title}: ${day.items.length} ${mode === 'series' ? 'episodes' : 'movies'}`;
      const description = day.items.map(item => `${item.label} — ${item.title} (${formatTime(item.runtime)})`).join('\\n');
      return `BEGIN:VEVENT\r\nUID:${plan.selection.id}-${day.date}@reelradar\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}\r\nDTSTART;VALUE=DATE:${day.date.replace(/-/g, '')}\r\nSUMMARY:${title.replace(/[,;]/g, ' ')}\r\nDESCRIPTION:${description.replace(/[,;]/g, ' ')}\r\nEND:VEVENT`;
    }).join('\r\n');
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//REELRADAR//BingeClock//EN\r\nCALSCALE:GREGORIAN\r\n${events}\r\nEND:VCALENDAR`;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const href = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = href; anchor.download = 'bingeclock-plan.ics'; anchor.click(); URL.revokeObjectURL(href);
  };

  return <main className="bc-page">

    <div className="bc-wrap">
      <section className="bc-hero"><span className="bc-kicker"><Hourglass size={14}/> YOUR WATCH-TIME PLANNER</span><h1>BINGE<span>CLOCK</span></h1><p>BingeClock tells you exactly how much to watch each day to finish a franchise or series before your deadline.</p><div className="bc-tagline">Less guessing. Better pacing. One episode at a time.</div>
        <details className="bc-how"><summary>How it works <ChevronDown size={16}/></summary><p>Choose a movie collection or TV series, set your deadline and daily watch time, then BingeClock builds a day-by-day plan from TMDB runtimes. Long movies and episodes stay together instead of being split between days. Tick off titles as you watch; progress is saved on this device.</p></details>
      </section>

      <section className="bc-panel">
        <div className="bc-mode" role="group" aria-label="Choose what to plan"><button type="button" className={mode === 'collection' ? 'active' : ''} onClick={() => { setMode('collection'); resetSelection(); }}><Film size={15}/> Movie Franchise</button><button type="button" className={mode === 'series' ? 'active' : ''} onClick={() => { setMode('series'); resetSelection(); }}><Tv size={15}/> Series</button></div>
        <label className="bc-field-label" htmlFor="bc-search">{mode === 'series' ? 'SEARCH TV SHOWS' : 'SEARCH MOVIE FRANCHISES'}</label>
        {!selection ? <div className="bc-search"><Search size={17}/><input id="bc-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={mode === 'series' ? 'Search a series, e.g. Breaking Bad…' : 'Search a franchise, e.g. Harry Potter…'} autoComplete="off"/><span>{searching ? 'Searching…' : ''}</span></div> : <div className="bc-selected">{selection.poster ? <img src={selection.poster} alt=""/> : <div className="bc-selected-placeholder"><Film/></div>}<div className="bc-selected-copy"><strong>{selection.title}</strong><p>{selection.year || (mode === 'series' ? 'TV series' : 'TMDB movie collection')} · {mode === 'series' ? 'Series' : 'Movie franchise'}</p></div><button className="bc-clear" onClick={resetSelection} aria-label="Choose another title" type="button"><X size={18}/></button></div>}
        {!selection && results.length > 0 && <div className="bc-search-results">{results.map(item => <button className="bc-search-result" type="button" key={item.id} onClick={() => selectItem(item)}>{item.poster ? <img src={item.poster} alt=""/> : <div/>}<span><strong>{item.title}</strong><small>{item.year || 'Year unavailable'} · {mode === 'series' ? 'TV series' : 'Movie collection'}</small></span><ArrowUpRight size={15}/></button>)}</div>}
        {!selection && searching && <p className="bc-loading">Looking through TMDB…</p>}
        {!selection && query.trim().length >= 2 && !searching && !results.length && !searchError && <p className="bc-empty">No matches found. Try another title or spelling.</p>}
        {searchError && <p className="bc-error">{searchError}</p>}

        <div className="bc-grid">
          <div><label className="bc-field-label" htmlFor="bc-start">START DATE</label><input id="bc-start" className="bc-date" type="date" min={today} value={startDate} onChange={event => setStartDate(event.target.value)}/></div>
          <div><label className="bc-field-label" htmlFor="bc-deadline">FINISH BY</label><input id="bc-deadline" className="bc-date" type="date" min={startDate} value={deadline} onChange={event => setDeadline(event.target.value)}/><div className="bc-quick">{[7,14,30].map(days => <button key={days} type="button" onClick={() => setDeadline(addDays(startDate, days))}>{days} days</button>)}</div></div>
        </div>
        <label className="bc-field-label" htmlFor="bc-hours">DAILY WATCH TIME</label><div className="bc-range-row"><span className="bc-muted">How much time can you set aside each day?</span><strong>{dailyHours}h / day</strong></div><input id="bc-hours" className="bc-range" type="range" min="1" max="12" step="0.5" value={dailyHours} onChange={event => setDailyHours(Number(event.target.value))}/><div className="bc-range-row"><span className="bc-muted">1 hour</span><span className="bc-muted">12 hours</span></div>
        <label className="bc-field-label">DAYS YOU CAN'T WATCH <span className="bc-muted">(OPTIONAL)</span></label><div className="bc-weekdays">{WEEKDAYS.map(day => <label key={day.value}><input type="checkbox" checked={excludedDays.includes(day.value)} onChange={() => setExcludedDays(current => current.includes(day.value) ? current.filter(value => value !== day.value) : [...current, day.value])}/>{day.label}</label>)}</div>
        <div className="bc-options"><label className="bc-check"><input type="checkbox" checked={skipSpecials} onChange={event => setSkipSpecials(event.target.checked)}/> Skip specials or extras</label><label className="bc-check"><input type="checkbox" checked={skipUnaired} onChange={event => setSkipUnaired(event.target.checked)}/> Skip unaired or unreleased titles</label></div>
        {planError && <p className="bc-error">{planError}</p>}
        {loadingPlan && <p className="bc-loading">Gathering runtimes from TMDB and building your watch plan…</p>}
        <div style={{marginTop:20}}><button className="bc-primary" type="button" disabled={!selection || loadingPlan || deadline < startDate || excludedDays.length === 7} onClick={() => selection && void loadPlan(selection)}><Sparkles size={16}/> {loadingPlan ? 'Building your plan…' : 'Calculate my BingeClock'}</button></div>
      </section>

      {plan && schedule && !loadingPlan && <section className="bc-results">
        <div className="bc-result-top"><div><span className="bc-kicker">YOUR WATCH PLAN IS READY</span><h2>{headline} <span style={{color:'#dfff00'}}>({formatTime(Math.ceil(totalMinutes / Math.max(1, availableDays)))}/day)</span></h2><p>{achievable ? `Your plan fits before ${prettyDate(deadline, {month:'short',day:'numeric'})}.` : 'Your current daily limit is not enough to finish by this deadline.'}</p></div><span className={`bc-badge ${!achievable ? 'not' : ''}`}>{feasibility}</span></div>
        <div className="bc-stat-grid"><div className="bc-stat"><span>Total runtime</span><strong>{formatTime(totalMinutes)}</strong><small>{(totalMinutes/60).toFixed(1)} total hours</small></div><div className="bc-stat"><span>{mode === 'series' ? 'Episodes' : 'Movies'}</span><strong>{plan.items.length}</strong><small>{mode === 'series' ? `${plan.stats.seasons} seasons · avg ${formatTime(plan.stats.averageMinutes)}/ep` : `Avg ${formatTime(plan.stats.averageMinutes)} / movie`}</small></div><div className="bc-stat"><span>Daily pace</span><strong>{paceCount}</strong><small>{mode === 'series' ? 'episodes / day' : 'movies / day'}</small></div><div className="bc-stat"><span>Finish date</span><strong>{finishDay ? prettyDate(finishDay) : '—'}</strong><small>{achievable ? 'Within deadline' : `At ${dailyHours}h/day`}</small></div><div className="bc-stat"><span>Buffer days</span><strong>{achievable ? bufferDays : '—'}</strong><small>{achievable ? 'Ahead of deadline' : 'More time needed'}</small></div></div>
        <div className="bc-ring-row"><div className="bc-ring"><svg viewBox="0 0 100 100" width="106" height="106"><circle className="track" cx="50" cy="50" r="42"/><circle className="value" cx="50" cy="50" r="42" strokeDasharray={263.9} strokeDashoffset={263.9 * (1 - Math.min(1, completedCount / Math.max(1, plan.items.length)))}/></svg><div className="bc-ring-center"><strong>{Math.round(completedCount / Math.max(1, plan.items.length) * 100)}%</strong><small>COMPLETE</small></div></div><div className="bc-ring-copy"><strong>{formatTime(totalMinutes - plan.items.filter(item => done.includes(item.key)).reduce((sum,item)=>sum+item.runtime,0))} left · {availableDays} watch days</strong><p>{achievable ? `At your selected pace, you finish ${bufferDays} ${bufferDays === 1 ? 'day' : 'days'} before the deadline.` : `You need about ${Math.max(0, requiredHours - dailyHours).toFixed(1)} extra hours per available day. At your current limit, the earliest finish is ${finishDay ? `${prettyDate(finishDay, {month:'short',day:'numeric',year:'numeric'})}${finishDay > deadline ? ` (${Math.round((parseDate(finishDay).getTime() - parseDate(deadline).getTime()) / 86400000)} days after your deadline)` : ''}` : 'not available'}.`}</p></div></div>
        {plan.missingRuntimeCount > 0 && <p className="bc-note">{plan.missingRuntimeCount} movie(s) without a TMDB runtime were omitted from the calculation.</p>}
        <div className="bc-actions"><button className="bc-secondary" type="button" onClick={() => void sharePlan()}><Share2 size={15}/> Share my plan</button><button className="bc-secondary" type="button" onClick={addCalendar}><CalendarDays size={15}/> Add to calendar</button>{shareNotice && <span className="bc-toast">{shareNotice}</span>}</div>
        <div className="bc-schedule-head"><h3>Your day-by-day schedule</h3><span>{completedCount} / {plan.items.length} completed</span></div><div className="bc-progress"><span style={{width:`${progressPercent}%`}}/></div>
        {schedule.days.map(day => <article className="bc-day" key={day.date}><div className="bc-day-head"><span>{prettyDate(day.date, {weekday:'short',month:'short',day:'numeric'})}</span><small>{day.items.length} {mode === 'series' ? 'episodes' : 'movies'} · {formatTime(day.minutes)}</small></div>{day.items.map(item => { const isDone = done.includes(item.key); return <label className={`bc-watch-item ${isDone ? 'bc-done' : ''}`} key={item.key}><input type="checkbox" checked={isDone} onChange={() => toggleDone(item.key)} aria-label={`Mark ${item.title} as ${isDone ? 'not watched' : 'watched'}`}/>{item.poster && <img src={item.poster} alt="" loading="lazy"/>}<span className="bc-watch-copy"><strong>{item.title}</strong><small>{item.label}</small></span><span className="bc-watch-runtime">{formatTime(item.runtime)}</span></label>; })}</article>)}
        <p className="bc-note">{schedule.days.some(day => day.minutes > dailyHours * 60) ? 'Some individual titles are longer than your daily limit. They remain whole in the schedule and will require extra time on those days.' : 'Each movie or episode stays together in one day. If the next title does not fit, it rolls over to the next available watch day.'} Progress is saved locally in this browser.</p>
      </section>}

      

    </div>
  </main>;
}
