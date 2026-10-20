'use client';

/**
 * Site navigation (client: needs the pathname for aria-current).
 * Keyboard-operable by construction (real links, real focus order).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/search', label: 'Search' },
  { href: '/library', label: 'Library' },
  { href: '/providers', label: 'Providers' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◈
          </span>
          CloudStream Web
          <span className="brand-tag">fixture catalog</span>
        </Link>
        <nav aria-label="Main navigation" className="site-nav">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link"
              aria-current={pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href)) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="header-spacer" />
        <Link href="/search" className="nav-link header-search-link">
          Search titles…
        </Link>
      </div>
    </header>
  );
}
