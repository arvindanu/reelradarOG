import type { ReactNode } from 'react';

/**
 * Next.js App Router remounts this template when the active route changes.
 * Keeping the animation on this page-only wrapper leaves the shared header,
 * navigation drawer, footer, and each page's layout dimensions untouched.
 */
export default function RouteTemplate({ children }: { children: ReactNode }) {
  return <div className="rr-route-transition">{children}</div>;
}
