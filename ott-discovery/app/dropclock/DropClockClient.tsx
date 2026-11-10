
'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent, type CSSProperties } from 'react';
import { ArrowLeft, Bell, CalendarPlus, CalendarClock, ChevronDown, Film, Globe2, RefreshCw, Radio, RotateCcw, Clapperboard, ArrowUpRight } from 'lucide-react';
import './dropclock.css';

type Drop = {
  id: number; mediaType: 'movie' | 'tv'; title: string; overview: string; poster: string | null; backdrop: string | null;
  releaseDate: string; year: string; rating: number | null; language: string; popularity: number;
  releaseType: 'theatre' | 'ott'; contentType: 'movie' | 'series' | 'documentary';
  seasonNumber: number | null; episodeNumber: number | null; episodeTitle: string | null; episodeOverview: string | null;
  exactTime?: string; timeZone?: string;
};

type FeedData = { items: Drop[]; awaited: Drop[]; region: string; updatedAt: string };
type ContentFilter = 'all' | 'movie' | 'series' | 'documentary';
type ReleaseFilter = 'all' | 'theatre' | 'ott';

const REGIONS = [
  ['IN','India'],['US','United States'],['GB','United Kingdom'],['CA','Canada'],['AU','Australia'],['KR','South Korea'],['JP','Japan'],['ES','Spain'],['DE','Germany'],['FR','France'],['BR','Brazil'],['MX','Mexico'],['ID','Indonesia'],['PH','Philippines'],['AE','United Arab Emirates'],['SG','Singapore'],
] as const;

const LANGUAGES = [
  ['','All languages'],['en','English'],['hi','Hindi'],['ta','Tamil'],['te','Telugu'],['ml','Malayalam'],['kn','Kannada'],['ko','Korean'],['ja','Japanese'],['es','Spanish'],['fr','French'],['de','German'],['it','Italian'],['pt','Portuguese'],['zh','Chinese'],['id','Indonesian'],['ar','Arabic'],['tr','Turkish'],['th','Thai'],
] as const;

const TMDB_LOGO = 'https://www.themoviedb.org/assets/2/v4/logos/primary-green.svg';

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
}

function shiftDate(key: string, days: number) {
  const [y,m,d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function zonedDateTime(date: string, time: string, zone: string) {
  const [y,m,d] = date.split('-').map(Number);
  const [hh,mm] = time.split(':').map(Number);
  const target = Date.UTC(y,m-1,d,hh,mm);
  let guess = target;

  for (let i=0;i<3;i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
      hour:'2-digit',
      minute:'2-digit',
      hourCycle:'h23'
    }).formatToParts(new Date(guess));

    const get = (t:string) => Number(parts.find(p=>p.type===t)?.value || 0);
    const represented = Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'));
    guess += target - represented;
  }

  return guess;
}

function releaseTimestamp(item: Drop) {
  if (!item.exactTime) return null;

  try {
    return zonedDateTime(
      item.releaseDate,
      item.exactTime,
      item.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
    );
  } catch {
    return null;
  }
}

function formatDate(item: Drop) {
  const date = new Date(`${item.releaseDate}T12:00:00`);
  const formatted = new Intl.DateTimeFormat(undefined, {
    weekday:'short',
    month:'short',
    day:'numeric'
  }).format(date);

  const timestamp = releaseTimestamp(item);

  if (timestamp !== null) {
    return `${formatted} · ${new Intl.DateTimeFormat(undefined,{
      hour:'numeric',
      minute:'2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }).format(new Date(timestamp))} ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  }

  return `${formatted} · Time varies by platform`;
}

function countdown(target: number, now: number) {
  const seconds = Math.max(0, Math.floor((target-now)/1000));
  const days = Math.floor(seconds/86400);
  const hours = Math.floor((seconds%86400)/3600);
  const minutes = Math.floor((seconds%3600)/60);
  const secs = seconds%60;

  return {
    days,
    hours,
    minutes,
    seconds: secs,
    short: days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m ${secs}s`,
    done: seconds === 0
  };
}

function icsDate(date: string, time?: string) {
  const compact = date.replaceAll('-','');
  return time ? `${compact}T${time.replace(':','')}00` : compact;
}

function addCalendar(item: Drop) {
  const start = icsDate(item.releaseDate, item.exactTime);

  const end = item.exactTime ? (() => {
    const [hour, minute] = item.exactTime!.split(':').map(Number);
    const total = hour * 60 + minute + 60;
    const endDate = total >= 1440 ? shiftDate(item.releaseDate, 1) : item.releaseDate;
    const endTime = `${String(Math.floor((total % 1440) / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
    return icsDate(endDate, endTime);
  })() : start;

  const zone = item.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const escape = (value: string) =>
    value.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');

  const description = item.overview || 'Release date listed by TMDB. Time varies by platform.';

  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//REELRADAR//DropClock//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:dropclock-${item.mediaType}-${item.id}-${item.releaseDate}@reelradar`,
    `DTSTART${item.exactTime ? `;TZID=${zone}:${start}` : ';VALUE=DATE:'+start}`,
    `DTEND${item.exactTime ? `;TZID=${zone}:${end}` : ';VALUE=DATE:'+icsDate(shiftDate(item.releaseDate,1))}`,
    `SUMMARY:${escape(item.title)}`,
    `DESCRIPTION:${escape(description)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const url = URL.createObjectURL(new Blob([content], { type:'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${item.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-drop.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function openTitle(item: Drop) {
  const handoff = {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    overview: item.overview,
    poster: item.poster,
    backdrop: item.backdrop,
    releaseDate: item.releaseDate,
    year: item.year,
    rating: item.rating,
    language: item.language,
    genres: [],
    trailerKey: null,
    trailerThumb: null,
    providers: [],
    watchLink: null,
  };

  try {
    sessionStorage.setItem('reelradar-dropclock-open-title', JSON.stringify(handoff));
  } catch {}

  window.location.assign('/');
}

function DropCard({ item, index, now, changed }: { item: Drop; index: number; now: number; changed: boolean }) {
  const target = releaseTimestamp(item);
  const clock = target === null ? null : countdown(target, now);
  const today = item.releaseDate === localDateKey();
  const outNow = item.releaseDate < localDateKey() || Boolean(clock?.done);

  const [reminded, setReminded] = useState(false);

  const remind = async (event: MouseEvent) => {
    event.stopPropagation();

    if (typeof Notification === 'undefined') {
      window.alert('Notifications are not supported by this browser.');
      return;
    }

    if (Notification.permission === 'denied') {
      window.alert('Notifications are blocked. Enable them in your browser settings.');
      return;
    }

    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (permission !== 'granted') return;

    const releaseTarget = releaseTimestamp(item);
    const targetTime =
      releaseTarget ?? new Date(`${item.releaseDate}T09:00:00`).getTime();

    const fireReminder = () => {
      const remaining = targetTime - Date.now();

      if (remaining > 2147480000) {
        window.setTimeout(fireReminder, 2147480000);
      } else if (remaining > 0) {
        window.setTimeout(
          () => new Notification(`DropClock: ${item.title}`, {
            body: `${formatDate(item)}. Check REELRADAR for release details.`,
            icon: item.poster || undefined
          }),
          remaining
        );
      } else {
        new Notification(`DropClock: ${item.title}`, {
          body: `${formatDate(item)}. Check REELRADAR for release details.`,
          icon: item.poster || undefined
        });
      }
    };

    fireReminder();
    setReminded(true);
  };

  return <article
    className={`dc-drop-card ${changed ? 'dc-card-updated' : ''}`}
    style={{ animationDelay: `${Math.min(index%8,7)*55}ms` }}
    onClick={() => openTitle(item)}
    tabIndex={0}
    onKeyDown={e=>{if(e.key==='Enter')openTitle(item);}}
  >
    <div className="dc-poster">
      {item.poster
        ? <img src={item.poster} alt={`${item.title} poster`} loading="lazy"/>
        : <div className="dc-poster-empty"><Film size={24}/></div>}

      {today && !outNow && <span className="dc-today-tag">DROPPING TODAY</span>}
      {outNow && <span className="dc-out-tag">OUT NOW</span>}
    </div>

    <div className="dc-card-copy">
      <div className="dc-badges">
        <span>{item.contentType === 'series' ? 'SERIES EPISODE' : item.contentType === 'documentary' ? 'DOCUMENTARY' : 'MOVIE'}</span>
        <span className={item.releaseType}>{item.releaseType === 'theatre' ? 'THEATRE' : 'OTT'}</span>
      </div>

      <h3>{item.title}</h3>

      {item.contentType === 'series' && (item.seasonNumber !== null || item.episodeNumber !== null) &&
        <p className="dc-episode">
          {item.seasonNumber !== null ? `S${String(item.seasonNumber).padStart(2,'0')}` : ''}
          {item.episodeNumber !== null ? ` · E${String(item.episodeNumber).padStart(2,'0')}` : ''}
          {item.episodeTitle ? ` — ${item.episodeTitle}` : ''}
        </p>
      }

      <div className="dc-date">
        <CalendarClock size={14}/>
        <span>{formatDate(item)}</span>
      </div>

      <div className="dc-card-meta">
        <span>{LANGUAGES.find(([code])=>code===item.language)?.[1] || item.language.toUpperCase() || 'Language TBA'}</span>
        {clock && !outNow && (target !== null && target-now <= 24*60*60*1000) &&
          <strong>in {clock.short}</strong>}
      </div>

      <div className="dc-card-actions">
        <button type="button" onClick={e=>{e.stopPropagation();addCalendar(item);}}>
          <CalendarPlus size={14}/> Calendar
        </button>
        <button type="button" onClick={remind}>
          <Bell size={14}/>{reminded?'Reminder set':'Remind me'}
        </button>
      </div>
    </div>
  </article>;
}

function AwaitedCard({ item, index, now }: { item: Drop; index: number; now: number }) {
  const releaseTarget = releaseTimestamp(item);

  const clock =
    releaseTarget !== null
      ? countdown(releaseTarget, now)
      : null;

  const progress =
    releaseTarget !== null
      ? Math.max(
          0,
          Math.min(
            100,
            100 - ((releaseTarget - now) / (45 * 86400000)) * 100
          )
        )
      : 0;

  return <button
    type="button"
    className={`dc-awaited-card ${clock?.done?'is-done':''}`}
    style={{'--dc-progress':`${progress}%`} as CSSProperties}
    onClick={()=>openTitle(item)}
  >
    <div
      className="dc-awaited-backdrop"
      style={item.backdrop ? {
        backgroundImage:`linear-gradient(0deg,rgba(5,7,10,.98),rgba(5,7,10,.28)),url(${item.backdrop})`
      } : {}}
    />

    <div className="dc-awaited-content">
      <span className="dc-awaited-index">0{index+1} / MOST AWAITED</span>

      <div className="dc-awaited-poster">
        {item.poster&&<img src={item.poster} alt=""/>}
      </div>

      <div className="dc-awaited-title">{item.title}</div>

      <small>
        {item.releaseDate
          ? new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${item.releaseDate}T12:00:00`))
          : 'Date TBA'}
      </small>

      {clock?.done
        ? <strong className="dc-now-title">OUT NOW!</strong>
        : clock
          ? <div className="dc-clock-digits">
              {[[clock.days,'D'],[clock.hours,'H'],[clock.minutes,'M'],[clock.seconds,'S']].map(([n,label])=>
                <span key={label}>
                  <b>{String(n).padStart(2,'0')}</b>
                  <i>{label}</i>
                </span>
              )}
            </div>
          : <strong className="dc-tba">DATE CONFIRMED · TIME TBA</strong>
      }

      <div className="dc-progress"><i/></div>
    </div>
  </button>;
}

export default function DropClockClient() {
  const [data,setData] = useState<FeedData|null>(null);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,setError] = useState('');
  const [region,setRegion] = useState('IN');
  const [language,setLanguage] = useState('');
  const [release,setRelease] = useState<ReleaseFilter>('all');
  const [content,setContent] = useState<ContentFilter>('all');
  const [now,setNow] = useState(Date.now());
  const [changedIds,setChangedIds] = useState<string[]>([]);
  const [lastUpdated,setLastUpdated] = useState('');

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else if (!data) setLoading(true);

    setError('');

    try {
      const response = await fetch(
        `/api/dropclock?region=${region}&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
        {cache:'no-store'}
      );

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Could not load the release radar.');

      const next = result as FeedData;

      if (data) {
        const oldMap = new Map(
          data.items.map(x=>[
            `${x.mediaType}:${x.id}:${x.releaseDate}`,
            JSON.stringify(x)
          ])
        );

        setChangedIds(
          next.items
            .filter(x=>oldMap.get(`${x.mediaType}:${x.id}:${x.releaseDate}`)!==JSON.stringify(x))
            .map(x=>`${x.mediaType}:${x.id}`)
        );

        window.setTimeout(()=>setChangedIds([]),2600);
      }

      setData(next);

      setLastUpdated(
        new Date(next.updatedAt).toLocaleTimeString(undefined,{
          hour:'numeric',
          minute:'2-digit',
          second:'2-digit'
        })
      );
    } catch(e) {
      setError(e instanceof Error?e.message:'Something went wrong.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  },[region,data]);

  useEffect(()=>{
    const locale = navigator.language || '';
    const detected = locale.split('-')[1]?.toUpperCase();

    if (detected && REGIONS.some(([code])=>code===detected)) {
      setRegion(detected);
    }
  },[]);

  useEffect(()=>{
    void load();
  },[region]);

  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[]);

  useEffect(()=>{
    const timer=window.setInterval(()=>{void load(true);},180000);
    return()=>window.clearInterval(timer);
  },[load]);

  const filtered = useMemo(()=>{
    if (!data) return [];

    return data.items.filter(item=>{
      if (language && item.language!==language) return false;
      if (release==='theatre' && (item.mediaType==='tv'||item.releaseType!=='theatre')) return false;
      if (release==='ott' && item.releaseType!=='ott') return false;
      if (content!=='all' && item.contentType!==content) return false;

      return true;
    });
  },[data,language,release,content]);

  const groups = useMemo(()=>{
    const today=localDateKey();
    const tomorrow=shiftDate(today,1);
    const weekEnd=shiftDate(today,7);
    const nextWeekEnd=shiftDate(today,14);

    const buckets: Record<string,Drop[]> = {
      'Today':[],
      'Tomorrow':[],
      'This Week':[],
      'Next Week':[],
      'Later':[]
    };

    for(const item of filtered){
      const date=item.releaseDate;

      if(date===today)buckets.Today.push(item);
      else if(date===tomorrow)buckets.Tomorrow.push(item);
      else if(date<=weekEnd)buckets['This Week'].push(item);
      else if(date<=nextWeekEnd)buckets['Next Week'].push(item);
      else buckets.Later.push(item);
    }

    return Object.entries(buckets).filter(([,items])=>items.length);
  },[filtered,now]);

  const reset=()=>{
    setLanguage('');
    setRelease('all');
    setContent('all');
  };

  // Safe fallback for missing or null API data.
  const awaited = data?.awaited ?? [];

  return <main className="dc-page">
    <div className="dc-grid-bg"/>

    

    <div className="dc-wrap">
      <section className="dc-hero">
        <div className="dc-kicker"><i/> RELEASE INTELLIGENCE / 01</div>

        <div className="dc-title-row">
          <div>
            <h1>DROP<span>CLOCK</span></h1>
            <p>DropClock is your live release radar: new episodes, movies, and documentaries, with the exact date and time they drop.</p>
          </div>

          <div className="dc-live-box">
            <span className="dc-live"><i/> LIVE</span>
            <small>LAST UPDATED</small>
            <strong>{lastUpdated || 'Syncing…'}</strong>
            <button type="button" onClick={()=>void load(true)} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing?'dc-spin':''}/>
              {refreshing?'Refreshing':'Refresh'}
            </button>
          </div>
        </div>

        <div className="dc-controls">
          <label className="dc-region">
            <Globe2 size={15}/>
            <select value={region} onChange={e=>setRegion(e.target.value)} aria-label="Release region">
              {REGIONS.map(([code,name])=><option key={code} value={code}>{name}</option>)}
            </select>
            <ChevronDown size={13}/>
          </label>

          <label className="dc-language">
            <select value={language} onChange={e=>setLanguage(e.target.value)} aria-label="Filter by original language">
              {LANGUAGES.map(([code,name])=><option key={code} value={code}>{name}</option>)}
            </select>
            <ChevronDown size={13}/>
          </label>

          <div className="dc-release-toggle">
            {(['all','theatre','ott'] as ReleaseFilter[]).map(value=>
              <button
                key={value}
                type="button"
                className={release===value?'active':''}
                onClick={()=>setRelease(value)}
              >
                {value==='all'?'All':value==='theatre'?'Theatre':'OTT'}
              </button>
            )}
          </div>
        </div>

        <div className="dc-filter-row">
          <div className="dc-content-chips">
            {(['all','movie','series','documentary'] as ContentFilter[]).map(value=>
              <button
                key={value}
                type="button"
                className={content===value?'active':''}
                onClick={()=>setContent(value)}
              >
                {value==='all'?'All':value==='movie'?'Movies':value==='series'?'Series':'Documentaries'}
              </button>
            )}
          </div>

          <div className="dc-match-count">
            {filtered.length} MATCHING DROPS
            <button type="button" onClick={reset}>
              <RotateCcw size={12}/> Reset
            </button>
          </div>
        </div>
      </section>

      {awaited.length > 0 && (
        <section className="dc-awaited-section">
          <div className="dc-section-heading">
            <div>
              <span className="dc-kicker">THE BIG ONES ARE COMING</span>
              <h2>Most Awaited<span>.</span></h2>
            </div>
            <small>POPULARITY-RANKED / TOP {awaited.length}</small>
          </div>

          <div className="dc-awaited-rail">
            {awaited.map((item,index)=>
              <AwaitedCard
                key={`${item.mediaType}-${item.id}`}
                item={item}
                index={index}
                now={now}
              />
            )}
          </div>
        </section>
      )}

      <section className="dc-feed-section">
        <div className="dc-section-heading">
          <div>
            <span className="dc-kicker">THE RELEASE FEED</span>
            <h2>Upcoming drops<span>.</span></h2>
          </div>
          <span className="dc-feed-status"><i/> LIVE DATA · {region}</span>
        </div>

        {loading ? (
          <div className="dc-drop-grid">
            {Array.from({length:8},(_,i)=>
              <div className="dc-skeleton" key={i}>
                <i/>
                <div><b/><small/><small/></div>
              </div>
            )}
          </div>
        ) : error && !data ? (
          <div className="dc-state">
            <Radio size={28}/>
            <h3>Radar temporarily offline</h3>
            <p>{error}</p>
            <button type="button" onClick={()=>void load(true)}>Try again</button>
          </div>
        ) : groups.length===0 ? (
          <div className="dc-state">
            <Film size={28}/>
            <h3>No drops match these filters</h3>
            <p>Try another language or release type to widen your radar.</p>
            <button type="button" onClick={reset}>Reset filters</button>
          </div>
        ) : (
          groups.map(([label,items])=>
            <section className="dc-day-group" key={label}>
              <div className="dc-day-heading">
                <h3>{label}</h3>
                <span>{items.length} {items.length===1?'DROP':'DROPS'}</span>
              </div>

              <div className="dc-drop-grid">
                {items.map((item,index)=>
                  <DropCard
                    key={`${item.mediaType}-${item.id}-${item.releaseDate}`}
                    item={item}
                    index={index}
                    now={now}
                    changed={changedIds.includes(`${item.mediaType}:${item.id}`)}
                  />
                )}
              </div>
            </section>
          )
        )}
      </section>

      
    </div>
  </main>;
}
