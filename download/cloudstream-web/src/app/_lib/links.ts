/**
 * Route helpers for provider-opaque contract values. All path segments that
 * carry provider data (detail URL, episode `data` token) are base64url
 * tokens produced here (see ./codec.ts — the app never inspects the values).
 */

import { encodeToken } from './codec';

export function titleHref(providerId: string, detailUrl: string): string {
  return `/title/${encodeURIComponent(providerId)}/${encodeToken(detailUrl)}`;
}

export function watchHref(providerId: string, detailUrl: string, dataToken: string): string {
  return `/watch/${encodeURIComponent(providerId)}/${encodeToken(detailUrl)}/${encodeToken(dataToken)}`;
}

export function searchHref(query: string, page = 1): string {
  const params = new URLSearchParams();
  if (query.trim().length > 0) params.set('q', query.trim());
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs.length > 0 ? `/search?${qs}` : '/search';
}
