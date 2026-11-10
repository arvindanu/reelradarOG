import type { Metadata, Viewport } from 'next';
import './globals.css';
import './home.css';
import './timeliner/timeliner.css';
import SharedSiteChrome from './SharedSiteChrome';

export const metadata: Metadata = {
  title: 'REELRADAR — Find what to watch',
  description: 'Discover new movies, series and documentaries across languages and streaming platforms.',
  applicationName: 'REELRADAR',
};
export const viewport: Viewport = { themeColor: '#08090d', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SharedSiteChrome>{children}</SharedSiteChrome></body></html>;
}
