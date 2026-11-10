'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarClock, Clapperboard, Clock3, Dices, GitMerge, Globe2, Heart,
  ChevronDown, Home as HomeIcon, Hourglass, Menu, ScanEye, ScanSearch, Sparkles, X,
} from 'lucide-react';
import { COUNTRIES } from '@/lib/catalog';

const NAV_ITEMS = [
  { key: 'home', label: 'Home', href: '/', Icon: HomeIcon },
  { key: 'wishlist', label: 'My Watchlist', href: '/?view=watchlist', Icon: Heart },
  { key: 'collide', label: 'Movie Collide', href: '/collide', Icon: GitMerge },
  { key: 'roulette', label: 'Movie Roulette', href: '/roulette', Icon: Dices },
  { key: 'timeliner', label: 'Timeliner', href: '/timeliner', Icon: Clock3 },
  { key: 'vibeflix', label: 'VibeFlix', href: '/vibeflix', Icon: Sparkles },
  { key: 'bingeclock', label: 'BingeClock', href: '/bingeclock', Icon: Hourglass },
  { key: 'actorlens', label: 'ActorLens', href: '/actorlens', Icon: ScanEye },
  { key: 'dropclock', label: 'DropClock', href: '/dropclock', Icon: CalendarClock },
  { key: 'lookalike', label: 'Lookalike', href: '/lookalike', Icon: ScanSearch },
];

export default function SharedSiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [region, setRegion] = useState('IN');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try { setRegion(localStorage.getItem('reelradar-region') || 'IN'); } catch { /* Storage is optional. */ }
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); triggerRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); };
  }, [menuOpen]);

  const isActive = (key: string) => key === 'home'
    ? pathname === '/'
    : key === 'actorlens'
      ? pathname.startsWith('/actorlens')
      : pathname === `/${key}`;

  const navigate = (href: string) => {
    setMenuOpen(false);
    router.push(href);
    if (href === '/') window.dispatchEvent(new Event('reelradar-reset-home'));
    if (href.includes('view=watchlist')) window.dispatchEvent(new Event('reelradar-show-wishlist'));
  };

  return <>
    <header className="topbar rr-shared-topbar">
      <Link className="brand" href="/" aria-label="REELRADAR Home">
        <span className="brand-mark"><Clapperboard size={19} strokeWidth={1.7} /></span>
        <span>REEL<span>RADAR</span></span><i />
      </Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        {NAV_ITEMS.map(item => <button key={item.key} className={isActive(item.key) ? 'nav-active' : ''} onClick={() => navigate(item.href)} type="button">{item.label}</button>)}
      </nav>
      <div className="header-actions">
        <label className="region-select"><Globe2 size={15} />
          <select value={region} onChange={event => {
            const nextRegion = event.target.value;
            setRegion(nextRegion);
            try { localStorage.setItem('reelradar-region', nextRegion); } catch { /* Storage is optional. */ }
            window.dispatchEvent(new CustomEvent('reelradar-region-change', { detail: nextRegion }));
          }} aria-label="Streaming country">
            {COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.label}</option>)}
          </select>
          <ChevronDown size={13} />
        </label>
        <button ref={triggerRef} className="mobile-menu-button" onClick={() => setMenuOpen(open => !open)} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="mobile-navigation-drawer" type="button">
          <Menu size={22} />
        </button>
      </div>
    </header>
    <button className={`mobile-drawer-overlay ${menuOpen ? 'is-open' : ''}`} type="button" aria-label="Close navigation menu" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} />
    <aside ref={drawerRef} id="mobile-navigation-drawer" className={`mobile-navigation-drawer ${menuOpen ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Navigation menu" aria-hidden={!menuOpen}>
      <div className="mobile-drawer-header"><span>MENU</span><button type="button" className="mobile-drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
      <nav className="mobile-drawer-links" aria-label="Main navigation">
        {NAV_ITEMS.map(({ key, label, href, Icon }) => <Link key={key} href={href} className={isActive(key) ? 'nav-active' : ''} onClick={() => { setMenuOpen(false); if (key === 'home') window.dispatchEvent(new Event('reelradar-reset-home')); if (key === 'wishlist') window.dispatchEvent(new Event('reelradar-show-wishlist')); }}><Icon size={17} />{label}</Link>)}
      </nav>
    </aside>
    <div className="rr-page-content">{children}</div>
    <footer className="footer rr-shared-footer">
      <Link className="brand" href="/"><span className="brand-mark"><Clapperboard size={17} strokeWidth={1.7} /></span><span>REEL<span>RADAR</span></span></Link>
      <p>One place for everything worth watching.</p>
      <span className="footer-credit">MOVIE DATA &amp; IMAGES BY TMDB · NOT AN OFFICIAL TMDB PRODUCT</span>
    </footer>
  </>;
}
