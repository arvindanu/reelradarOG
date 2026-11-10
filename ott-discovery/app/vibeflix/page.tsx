'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Check, ChevronLeft, Clapperboard, ExternalLink,
  Heart, LoaderCircle, Play, RotateCcw, Share2, Shuffle, Sparkles, Star,
} from 'lucide-react';
import './vibeflix.css';

type Provider = { id: number; name: string; logo: string | null };
type Title = {
  id: number; mediaType: 'movie' | 'tv'; title: string; overview: string; poster: string | null;
  backdrop: string | null; releaseDate: string; year: string; rating: number | null; voteCount: number;
  language: string; genres: number[]; runtime: number | null; providers: Provider[];
  watchLink: string | null; trailerKey: string | null; score: number; reasons: string[];
};
type Answers = {
  genre: string; story: string; tone: string; themes: string; pacing: string;
  style: string; format: string; company: string; language: string; region: string;
};
type Result = {
  match: Title; runnersUp: Title[]; matchPercent: number; totalCandidates: number;
  note: string; matchExplanation?: string; aiUsed?: boolean;
};
type Choice = { value: string; emoji: string; title: string; sub?: string };
type Question = {
  key: keyof Pick<Answers, 'genre' | 'story' | 'tone' | 'themes' | 'pacing' | 'style' | 'format' | 'company'>;
  eyebrow: string; title: string; subtitle: string; choices: Choice[];
};

const QUESTIONS: Question[] = [
  {
    key: 'genre', eyebrow: '01 / STORY TERRITORY',
    title: 'Which kind of story pulls you in first?',
    subtitle: 'Choose the genre you most want tonight. Gemini will still consider the other qualities you choose.',
    choices: [
      { value: 'thriller', emoji: '🕵️', title: 'Thriller', sub: 'Suspense, danger and tension' },
      { value: 'scifi', emoji: '🚀', title: 'Science fiction', sub: 'Ideas, technology and the future' },
      { value: 'drama', emoji: '🎭', title: 'Drama', sub: 'People, choices and consequences' },
      { value: 'comedy', emoji: '😂', title: 'Comedy', sub: 'Wit, chaos and laughs' },
      { value: 'crime', emoji: '🧩', title: 'Crime', sub: 'Cases, criminals and investigations' },
      { value: 'mystery', emoji: '🔎', title: 'Mystery', sub: 'Secrets and unanswered questions' },
      { value: 'horror', emoji: '🌑', title: 'Horror', sub: 'Dread, fear and the unknown' },
      { value: 'romance', emoji: '💞', title: 'Romance', sub: 'Love and human connection' },
      { value: 'action', emoji: '💥', title: 'Action', sub: 'Momentum and high stakes' },
      { value: 'adventure', emoji: '🗺️', title: 'Adventure', sub: 'Discovery and the unknown' },
      { value: 'fantasy', emoji: '🐉', title: 'Fantasy', sub: 'Magic and imagined worlds' },
      { value: 'animation', emoji: '🎨', title: 'Animation', sub: 'Animated stories of any kind' },
    ],
  },
  {
    key: 'story', eyebrow: '02 / THE STORY ENGINE',
    title: 'What kind of story setup hooks you?',
    subtitle: 'Think about the central situation, not just the genre label.',
    choices: [
      { value: 'mystery', emoji: '🧠', title: 'A puzzle to solve', sub: 'Clues, secrets and revelations' },
      { value: 'survival', emoji: '🏕️', title: 'Survival against the odds', sub: 'A person pushed to their limits' },
      { value: 'relationships', emoji: '🫂', title: 'Complicated relationships', sub: 'People, bonds and conflict' },
      { value: 'heist', emoji: '🎯', title: 'A clever plan', sub: 'Heists, schemes and strategy' },
      { value: 'transformation', emoji: '🦋', title: 'A personal transformation', sub: 'A character changed by events' },
      { value: 'moral_dilemma', emoji: '⚖️', title: 'A difficult moral choice', sub: 'No easy answers' },
      { value: 'worldbuilding', emoji: '🌌', title: 'A world to get lost in', sub: 'Rich settings and deep lore' },
      { value: 'investigation', emoji: '🗂️', title: 'An investigation', sub: 'Following evidence to the truth' },
    ],
  },
  {
    key: 'tone', eyebrow: '03 / EMOTIONAL TONE',
    title: 'What should the overall tone feel like?',
    subtitle: 'This helps separate stories with similar genres but very different moods.',
    choices: [
      { value: 'light', emoji: '☀️', title: 'Light and witty', sub: 'Easygoing, playful and warm' },
      { value: 'tense', emoji: '⚡', title: 'Tense and suspenseful', sub: 'Pressure that keeps building' },
      { value: 'dark', emoji: '🌘', title: 'Dark and unsettling', sub: 'Morally grey and intense' },
      { value: 'hopeful', emoji: '🌱', title: 'Hopeful and uplifting', sub: 'Optimism through difficulty' },
      { value: 'emotional', emoji: '🥹', title: 'Deeply emotional', sub: 'Moving, intimate and affecting' },
      { value: 'eerie', emoji: '🕯️', title: 'Eerie and mysterious', sub: 'An atmosphere of unease' },
      { value: 'adventurous', emoji: '🧭', title: 'Adventurous and exciting', sub: 'A sense of discovery' },
    ],
  },
  {
    key: 'themes', eyebrow: '04 / IDEAS THAT MATTER',
    title: 'Which theme would you rather explore?',
    subtitle: 'Pick the subject matter you find most compelling.',
    choices: [
      { value: 'identity', emoji: '🪞', title: 'Identity and self-discovery', sub: 'Who we are and who we become' },
      { value: 'justice', emoji: '⚖️', title: 'Justice and revenge', sub: 'Righting wrongs and consequences' },
      { value: 'family', emoji: '🏡', title: 'Family and belonging', sub: 'Connection, loyalty and home' },
      { value: 'ambition', emoji: '🏆', title: 'Ambition and power', sub: 'Success, control and its cost' },
      { value: 'love_loss', emoji: '💌', title: 'Love and loss', sub: 'Relationships that change us' },
      { value: 'survival', emoji: '🔥', title: 'Survival and freedom', sub: 'Endurance against the odds' },
      { value: 'technology', emoji: '🤖', title: 'Technology and humanity', sub: 'What progress means for us' },
      { value: 'society', emoji: '🌍', title: 'Society and real-world issues', sub: 'Stories about the world we live in' },
    ],
  },
  {
    key: 'pacing', eyebrow: '05 / STORY RHYTHM',
    title: 'What pace keeps you engaged?',
    subtitle: 'A great story can be gripping without moving at the same speed.',
    choices: [
      { value: 'fast', emoji: '🏎️', title: 'Fast and gripping', sub: 'Things keep happening' },
      { value: 'balanced', emoji: '🎬', title: 'A balanced build', sub: 'Character and plot in equal measure' },
      { value: 'slow', emoji: '🌊', title: 'Slow-burn storytelling', sub: 'Let tension and details build' },
      { value: 'unpredictable', emoji: '🌀', title: 'Unpredictable', sub: 'Shifts, surprises and changing direction' },
    ],
  },
  {
    key: 'style', eyebrow: '06 / CINEMATIC WORLD',
    title: 'Which kind of world do you want to enter?',
    subtitle: 'Think about the setting and visual storytelling style you enjoy.',
    choices: [
      { value: 'realistic', emoji: '🎞️', title: 'Grounded and realistic', sub: 'Believable people and places' },
      { value: 'atmospheric', emoji: '🌫️', title: 'Atmospheric', sub: 'Mood, tension and visual detail' },
      { value: 'imaginative', emoji: '🏰', title: 'Imaginative worlds', sub: 'Fantasy, wonder and discovery' },
      { value: 'historical', emoji: '📜', title: 'Historical settings', sub: 'Another era brought to life' },
      { value: 'futuristic', emoji: '🛸', title: 'Futuristic', sub: 'Technology and possible futures' },
      { value: 'surreal', emoji: '🪐', title: 'Surreal and unconventional', sub: 'Dreamlike and unexpected' },
      { value: 'intimate', emoji: '🕯️', title: 'Intimate and character-led', sub: 'Close, personal storytelling' },
    ],
  },
  {
    key: 'format', eyebrow: '07 / YOUR WATCH WINDOW',
    title: 'What are you in the mood to commit to?',
    subtitle: 'We will use this to avoid recommending the wrong format or length.',
    choices: [
      { value: 'short', emoji: '⏱️', title: 'A shorter movie', sub: 'Ideally under 100 minutes' },
      { value: 'feature', emoji: '🍿', title: 'A full-length movie', sub: 'A proper movie-night experience' },
      { value: 'series', emoji: '📺', title: 'A series', sub: 'I want an episode or a new show' },
      { value: 'any', emoji: '♾️', title: 'No preference', sub: 'Choose the strongest match' },
    ],
  },
  {
    key: 'company', eyebrow: '08 / WHO IS WATCHING?',
    title: 'Who will be watching with you?',
    subtitle: 'This is a suitability and shared-viewing signal, not a personality test.',
    choices: [
      { value: 'solo', emoji: '🧘', title: 'Just me', sub: 'Recommend what fits my taste' },
      { value: 'date', emoji: '🫶', title: 'A date or partner', sub: 'Something we can enjoy together' },
      { value: 'friends', emoji: '🧑‍🤝‍🧑', title: 'Friends', sub: 'A good shared watch' },
      { value: 'family', emoji: '👨‍👩‍👧‍👦', title: 'Family', sub: 'Avoid clearly adult or unsuitable picks' },
    ],
  },
];

const LANGUAGES = [
  ['any', 'No preference'], ['en', 'English'], ['hi', 'Hindi'], ['ml', 'Malayalam'],
  ['ta', 'Tamil'], ['te', 'Telugu'], ['kn', 'Kannada'], ['ja', 'Japanese'],
  ['ko', 'Korean'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
  ['it', 'Italian'], ['zh', 'Chinese'], ['pt', 'Portuguese'], ['ar', 'Arabic'],
  ['tr', 'Turkish'], ['bn', 'Bengali'],
] as const;

const WISHLIST_KEY = 'reelradar-wishlist-v1';
const LAST_KEY = 'reelradar-vibeflix-last-v1';
const SEEN_KEY = 'reelradar-vibeflix-seen-v1';
const DEFAULT_ANSWERS: Answers = {
  genre: 'drama', story: 'mystery', tone: 'balanced', themes: 'identity',
  pacing: 'balanced', style: 'realistic', format: 'any', company: 'solo',
  language: 'any', region: 'IN',
};

function readList(key: string): any[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function getWatchUrl(provider: string, title: string, fallback: string | null) {
  const query = encodeURIComponent(title);
  const name = provider.toLowerCase();
  if (name.includes('netflix')) return `https://www.netflix.com/search?q=${query}`;
  if (name.includes('prime video') || name.includes('amazon prime')) return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${query}`;
  if (name.includes('disney')) return `https://www.disneyplus.com/search?q=${query}`;
  if (name.includes('apple tv')) return `https://tv.apple.com/search?term=${query}`;
  if (name.includes('hotstar')) return `https://www.hotstar.com/in/search?q=${query}`;
  if (name.includes('zee5')) return `https://www.zee5.com/search?q=${query}`;
  if (name.includes('sonyliv')) return `https://www.sonyliv.com/search?q=${query}`;
  return fallback ?? `https://www.google.com/search?q=${encodeURIComponent(`${title} ${provider} streaming`)}`;
}

export default function VibeFlixPage() {
  const [screen, setScreen] = useState<'intro' | 'quiz' | 'matching' | 'result'>('intro');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wishlisted, setWishlisted] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const question = QUESTIONS[step];

  useEffect(() => {
    setSeen(readList(SEEN_KEY).map(String));
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
      if (saved?.match?.id && saved?.match?.title) {
        setResult(saved as Result);
        setScreen('result');
      }
    } catch {
      // Ignore old or malformed saved results.
    }
  }, []);

  useEffect(() => {
    if (result) {
      try { localStorage.setItem(LAST_KEY, JSON.stringify(result)); } catch {}
    }
  }, [result]);

  useEffect(() => () => {
    if (advanceRef.current) clearTimeout(advanceRef.current);
  }, []);

  const requestMatch = useCallback(async (nextAnswers: Answers, excluded: string[] = []) => {
    setError('');
    setLoading(true);
    setScreen('matching');

    try {
      const response = await fetch('/api/vibeflix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: nextAnswers, exclude: excluded }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'We could not find a match. Please try again.');
      const next = data as Result;
      if (!next.match?.id || !next.match?.title) {
        throw new Error('TMDB returned an incomplete recommendation. Please try again.');
      }

      setResult(next);
      const newKeys = [next.match, ...(next.runnersUp ?? [])]
        .map(item => `${item.mediaType}:${item.id}`);
      setSeen(current => {
        const updated = [...new Set([...current, ...newKeys])].slice(-100);
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
      setWishlisted(readList(WISHLIST_KEY).some((item: any) =>
        item.id === next.match.id && item.mediaType === next.match.mediaType
      ));
      setScreen('result');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Something went wrong.');
      setScreen('quiz');
    } finally {
      setLoading(false);
    }
  }, []);

  const start = () => {
    setAnswers(DEFAULT_ANSWERS);
    setStep(0);
    setError('');
    setResult(null);
    setScreen('quiz');
  };

  const choose = (value: string) => {
    const updated = { ...answers, [question.key]: value };
    setAnswers(updated);
    if (advanceRef.current) clearTimeout(advanceRef.current);

    advanceRef.current = setTimeout(() => {
      if (step < QUESTIONS.length - 1) {
        setStep(current => current + 1);
      } else {
        void requestMatch(updated, seen);
      }
    }, 240);
  };

  const surprise = () => {
    const random = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
    const next: Answers = {
      genre: random(['thriller', 'scifi', 'drama', 'comedy', 'crime', 'mystery', 'horror', 'romance', 'action', 'adventure', 'fantasy', 'animation']),
      story: random(['mystery', 'survival', 'relationships', 'heist', 'transformation', 'moral_dilemma', 'worldbuilding', 'investigation']),
      tone: random(['light', 'tense', 'dark', 'hopeful', 'emotional', 'eerie', 'adventurous']),
      themes: random(['identity', 'justice', 'family', 'ambition', 'love_loss', 'survival', 'technology', 'society']),
      pacing: random(['fast', 'balanced', 'slow', 'unpredictable']),
      style: random(['realistic', 'atmospheric', 'imaginative', 'historical', 'futuristic', 'surreal', 'intimate']),
      format: random(['short', 'feature', 'series', 'any']),
      company: random(['solo', 'date', 'friends', 'family']),
      language: answers.language,
      region: answers.region,
    };
    setAnswers(next);
    void requestMatch(next, seen);
  };

  const another = () => {
    if (result) void requestMatch(answers, seen);
  };

  const toggleWishlist = () => {
    if (!result) return;
    const item = result.match;
    const rows = readList(WISHLIST_KEY);
    const exists = rows.some((row: any) => row.id === item.id && row.mediaType === item.mediaType);
    const next = exists
      ? rows.filter((row: any) => !(row.id === item.id && row.mediaType === item.mediaType))
      : [{
          id: item.id, mediaType: item.mediaType, title: item.title, overview: item.overview,
          poster: item.poster, backdrop: item.backdrop, releaseDate: item.releaseDate,
          year: item.year, rating: item.rating, language: item.language, genres: item.genres,
          trailerKey: item.trailerKey,
          trailerThumb: item.trailerKey ? `https://img.youtube.com/vi/${item.trailerKey}/hqdefault.jpg` : null,
          providers: item.providers, watchLink: item.watchLink,
        }, ...rows];

    try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(next)); } catch {}
    setWishlisted(!exists);
  };

  const share = async () => {
    if (!result) return;
    const url = `${window.location.origin}/vibeflix`;
    const text = `My VibeFlix pick: ${result.match.title} (${result.match.year || 'new discovery'}). Find your movie mood on ReelRadar.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `VibeFlix: ${result.match.title}`, text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name !== 'AbortError') {
        setError('Could not share this result.');
      }
    }
  };

  const back = () => {
    if (advanceRef.current) clearTimeout(advanceRef.current);
    if (step > 0) setStep(current => current - 1);
    else setScreen('intro');
  };

  const trailerUrl = result?.match.trailerKey
    ? `https://www.youtube.com/watch?v=${result.match.trailerKey}`
    : result
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${result.match.title} official trailer`)}`
      : '';
  const progress = useMemo(() => ((step + 1) / QUESTIONS.length) * 100, [step]);

  return (
    <main className="vf-page">
      <div className="vf-shell">
        

        {screen === 'intro' && (
          <section className="vf-hero">
            <div className="vf-orb">🎬</div>
            <span className="vf-kicker">YOUR TASTE. YOUR NEXT STORY.</span>
            <h1>FIND YOUR<br /><span>VIBE.</span></h1>
            <p>
              Eight thoughtful questions help us understand the stories, themes and cinematic
              experiences you enjoy. Gemini compares your taste with real movies and series,
              so you spend less time scrolling and more time watching.
            </p>
            <div className="vf-actions">
              <button className="vf-btn primary" onClick={start}>Start the vibe check <ArrowRight size={16} /></button>
              <button className="vf-btn" onClick={surprise}><Shuffle size={15} /> Surprise me</button>
            </div>
            <div className="vf-footnote">8 TASTE QUESTIONS · GEMINI-POWERED MATCHING · TMDB TITLES</div>
          </section>
        )}

        {screen === 'quiz' && (
          <section className="vf-quiz">
            <div className="vf-quiz-top">
              <button className="vf-text-btn" onClick={back}><ChevronLeft size={16} /> Back</button>
              <span className="vf-step-label">QUESTION {step + 1} OF {QUESTIONS.length}</span>
              <button className="vf-text-btn" onClick={surprise}>Surprise me <Shuffle size={14} /></button>
            </div>
            <div className="vf-progress"><span style={{ width: `${progress}%` }} /></div>
            <div className="vf-question" key={question.key}>
              <span className="vf-kicker">{question.eyebrow}</span>
              <h2>{question.title}</h2>
              <p>{question.subtitle}</p>
              <div className="vf-options">
                {question.choices.map(choice => (
                  <button
                    type="button"
                    className={`vf-option ${answers[question.key] === choice.value ? 'selected' : ''}`}
                    key={choice.value}
                    onClick={() => choose(choice.value)}
                  >
                    <span className="vf-emoji">{choice.emoji}</span>
                    <strong>{choice.title}</strong>
                    {choice.sub && <small>{choice.sub}</small>}
                    {answers[question.key] === choice.value && <Check className="vf-check" size={16} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="vf-language">
              <label htmlFor="vf-language">OPTIONAL · ANY LANGUAGE PREFERENCE?</label>
              <select
                id="vf-language"
                value={answers.language}
                onChange={event => setAnswers(current => ({ ...current, language: event.target.value }))}
              >
                {LANGUAGES.map(([code, label]) => <option value={code} key={code}>{label}</option>)}
              </select>
            </div>
            {error && (
              <div className="vf-error" role="alert">
                {error}
                <button className="vf-text-btn" onClick={() => void requestMatch(answers, seen)}>
                  Try again <ArrowRight size={13} />
                </button>
              </div>
            )}
            <div className="vf-quiz-bottom">
              <span className="vf-step-label">EACH ANSWER SHAPES YOUR MATCH</span>
              <button className="vf-text-btn" onClick={() => { setAnswers(DEFAULT_ANSWERS); setStep(0); }}>
                Reset answers <RotateCcw size={13} />
              </button>
            </div>
          </section>
        )}

        {screen === 'matching' && (
          <section className="vf-matching">
            <div>
              <div className="vf-loader"><span>🍿</span></div>
              <span className="vf-kicker">ANALYSING YOUR TASTE</span>
              <h2>Finding your kind of story…</h2>
              <p>Gemini is comparing your answers with real titles from TMDB.</p>
              <div style={{ marginTop: 24 }}><LoaderCircle size={17} className="vf-spin-icon" /></div>
            </div>
          </section>
        )}

        {screen === 'result' && result && (
          <section className="vf-result">
            <div className="vf-result-head">
              <div>
                <span className="vf-kicker">YOUR VIBEFLIX MATCH</span>
                <h2>Tonight, press play on this.</h2>
              </div>
              <button className="vf-text-btn vf-retake-btn" onClick={start}>
                <RotateCcw size={14} className="vf-retake-icon" /><span>Retake quiz</span>
              </button>
            </div>

            <div className="vf-result-grid">
              <div className="vf-poster-wrap">
                {result.match.poster
                  ? <img src={result.match.poster} alt={`${result.match.title} poster`} />
                  : <div className="vf-poster-fallback">🎬</div>}
                <div className="vf-match-ring"><strong>{result.matchPercent}%</strong><small>MATCH</small></div>
              </div>

              <div className="vf-copy">
                <span className="vf-type"><Sparkles size={13} /> {result.match.mediaType === 'tv' ? 'SERIES PICK' : 'MOVIE PICK'}</span>
                <h3>{result.match.title}</h3>
                <div className="vf-meta">
                  {result.match.year && <span>{result.match.year}</span>}
                  <span>
                    {result.match.mediaType === 'tv'
                      ? result.match.runtime ? `${result.match.runtime} min / episode` : 'TV Series'
                      : result.match.runtime ? `${result.match.runtime} min` : 'Feature film'}
                  </span>
                  {result.match.rating !== null && (
                    <span className="rating"><Star size={12} fill="currentColor" /> {result.match.rating.toFixed(1)} / 10</span>
                  )}
                </div>
                <p className="vf-overview">{result.match.overview || 'A story worth discovering. Open the trailer to get a feel for this pick.'}</p>

                <div className="vf-why">
                  <div className="vf-why-heading">
                    <strong>WHY THIS MATCHES YOUR TASTE</strong>
                    {result.aiUsed && <span className="vf-ai-tag"><Sparkles size={11} /> GEMINI AI</span>}
                  </div>
                  {result.matchExplanation && <p className="vf-explanation">{result.matchExplanation}</p>}
                  <div className="vf-reasons">
                    {(result.match.reasons ?? []).map((reason, index) => <span key={`${reason}-${index}`}>{reason}</span>)}
                  </div>
                </div>

                <div className="vf-provider-title">WHERE TO WATCH {result.match.providers.length > 0 ? '· YOUR REGION' : ''}</div>
                {result.match.providers.length ? (
                  <div className="vf-providers">
                    {result.match.providers.map(provider => (
                      <a
                        className="vf-provider"
                        key={provider.id}
                        href={getWatchUrl(provider.name, result.match.title, result.match.watchLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {provider.logo && <img src={provider.logo} alt="" />}
                        {provider.name}<ExternalLink size={11} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="vf-empty">Streaming availability was not returned for your region. Check TMDB for current options.</div>
                )}

                <div className="vf-result-actions">
                  <a className="vf-btn primary" href={trailerUrl} target="_blank" rel="noreferrer">
                    <Play size={15} fill="currentColor" /> Watch trailer <ExternalLink size={13} />
                  </a>
                  <button className="vf-btn" onClick={toggleWishlist}>
                    <Heart size={15} fill={wishlisted ? 'currentColor' : 'none'} color={wishlisted ? '#dfff00' : 'currentColor'} />
                    {wishlisted ? 'Saved to wishlist' : 'Add to wishlist'}
                  </button>
                  <button className="vf-btn" onClick={share}><Share2 size={15} />{copied ? 'Copied!' : 'Share pick'}</button>
                  <button className="vf-btn" onClick={another} disabled={loading}><Shuffle size={15} /> Try another</button>
                </div>
              </div>
            </div>

            {result.runnersUp?.length > 0 && (
              <>
                <div className="vf-runner-title"><h3>More picks for your vibe</h3><span>ALSO MATCHED FOR YOU</span></div>
                <div className="vf-runners">
                  {result.runnersUp.map(item => (
                    <article className="vf-runner" key={`${item.mediaType}:${item.id}`}>
                      {item.poster
                        ? <img src={item.poster} alt={`${item.title} poster`} loading="lazy" />
                        : <div className="vf-empty">Poster unavailable</div>}
                      <div className="vf-runner-copy">
                        <strong>{item.title}</strong>
                        <small>
                          {item.year || 'Release date unavailable'} · {item.mediaType === 'tv' ? 'Series' : 'Movie'}
                          {item.rating ? ` · ★ ${item.rating.toFixed(1)}` : ''}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}

            <div className="vf-result-actions" style={{ marginTop: 30 }}>
              <button className="vf-btn primary" onClick={another}><Shuffle size={15} /> Find another match</button>
              <button className="vf-btn" onClick={start}><RotateCcw size={15} /> Start over</button>
            </div>
            {!result.aiUsed && <p className="vf-fallback-note">{result.note}</p>}
          </section>
        )}

        
      </div>
    </main>
  );
}
