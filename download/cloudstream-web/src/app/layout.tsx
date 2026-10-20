/**
 * Root layout: dark media-center shell, accessible navigation (skip link,
 * landmarks, aria-current) and a footer that stays pinned to the viewport
 * bottom (flex column + mt-auto equivalent via flex:1 main).
 */

import type { Metadata, Viewport } from 'next';
import { SiteHeader } from './_components/SiteHeader';
import './globals.css';

/**
 * D26: the nonce-based CSP (src/proxy.ts) requires every page to be
 * dynamically rendered — a per-request nonce cannot be baked into statically
 * prerendered HTML. Recorded trade-off: static optimization / ISR are
 * intentionally disabled; the catalog already comes from the in-process
 * provider host (runtime kill switch), so per-request rendering is
 * semantically honest.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'CloudStream Web',
    template: '%s · CloudStream Web',
  },
  description:
    'Clean-room, CloudStream-inspired media application for the browser — fixture catalog, local files, and authorized demo streams only.',
};

export const viewport: Viewport = {
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="site-shell">
          <SiteHeader />
          <main id="main-content" className="site-main">
            {children}
          </main>
          <footer className="site-footer">
            <div className="site-footer-inner">
              <span>
                Clean-room, CloudStream-inspired architecture. Fixture catalog only — no third-party
                content providers are configured (see POLICY.md).
              </span>
              <span>Local files never leave your device.</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
