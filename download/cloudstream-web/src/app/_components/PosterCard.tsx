/**
 * Poster card — the shared catalog tile (home rows, search results,
 * recommendations). Pure presentational: safe in server or client trees.
 */

import type { ReactNode } from 'react';

export interface PosterCardProps {
  readonly href: string;
  readonly name: string;
  readonly posterUrl: string | null;
  readonly type: string;
  readonly quality?: string | null;
  readonly score?: number | null;
  readonly year?: number | null;
  /** Extra meta line (e.g. episode label or provider name). */
  readonly footer?: ReactNode;
  readonly priority?: boolean;
}

export function PosterCard({
  href,
  name,
  posterUrl,
  type,
  quality,
  score,
  year,
  footer,
  priority = false,
}: PosterCardProps) {
  // Tiny inline placeholder keeps cards intact when a provider omits a poster.
  const FALLBACK_POSTER =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#161b22"/><text x="150" y="230" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#8b949e">no poster</text></svg>',
    );
  return (
    <a href={href} className="poster-card" data-testid="poster-card">
      <img
        className="poster-img"
        src={posterUrl && posterUrl.length > 0 ? posterUrl : FALLBACK_POSTER}
        alt={`${name} poster`}
        width={300}
        height={450}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
      <span className="poster-name">{name}</span>
      <span className="poster-meta">
        <span className="badge badge-accent">{type}</span>
        {quality ? <span className="badge">{quality}</span> : null}
        {year != null ? <span>{year}</span> : null}
        {score != null ? <span className="score">★ {score.toFixed(1)}</span> : null}
      </span>
      {footer ? <span className="poster-meta">{footer}</span> : null}
    </a>
  );
}
