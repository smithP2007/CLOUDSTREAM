/**
 * Server-side view builders: contract payloads → UI view models with
 * precomputed route hrefs. Kept server-side (RSC + route handlers) because
 * the provider-name→id mapping comes from the installed-provider registry.
 */

import { listInstalledProviders } from './index';
import type { SearchResponse } from '../../core/types';
import { titleHref } from '../../app/_lib/links';

/** UI card view: the contract item plus its resolved detail route. */
export interface CatalogCardView {
  readonly item: SearchResponse;
  readonly href: string;
}

export function providerIdForName(providerName: string): string | null {
  return listInstalledProviders().find((meta) => meta.name === providerName)?.id ?? null;
}

export function toCardView(item: SearchResponse): CatalogCardView {
  const id = providerIdForName(item.providerName);
  const providerSegment = id ?? encodeURIComponent(item.providerName);
  return { item, href: titleHref(providerSegment, item.url) };
}

export function toCardViews(items: readonly SearchResponse[]): CatalogCardView[] {
  return items.map(toCardView);
}
