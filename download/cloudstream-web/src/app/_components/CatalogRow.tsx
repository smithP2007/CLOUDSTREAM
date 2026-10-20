/**
 * A titled catalog row with horizontally scrollable poster cards
 * (mirrors the upstream homepage rows: `HomePageList.isHorizontalImages`).
 * Items arrive as server-built {@link CatalogCardView}s (href precomputed).
 */

import { PosterCard } from './PosterCard';
import type { CatalogCardView } from '../../server/catalog/views';

export interface CatalogRowProps {
  readonly name: string;
  readonly items: readonly CatalogCardView[];
  readonly priority?: boolean;
}

export function CatalogRow({ name, items, priority = false }: CatalogRowProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label={name}>
      <div className="section-head">
        <h2>{name}</h2>
      </div>
      <div className="row-scroller" role="list">
        {items.map(({ item, href }) => (
          <div role="listitem" key={`${item.providerName}:${item.url}`}>
            <PosterCard
              href={href}
              name={item.name}
              posterUrl={item.posterUrl ?? null}
              type={item.type}
              quality={item.quality}
              score={item.score}
              priority={priority}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
