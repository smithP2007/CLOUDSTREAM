/**
 * Local library store — favorites and recent playback, persisted in
 * localStorage (decision D24: user data is LOCAL-ONLY in this phase; the
 * roadmap's server-side per-user DB is deferred with the authenticated
 * surface work). Nothing here is ever transmitted: entries reference public
 * fixture titles, never credentials or personal data.
 *
 * The store is a tiny observable singleton so React can subscribe via
 * `useSyncExternalStore`; writes are validated + capped, and unreadable
 * persisted state is discarded (never throws into the UI).
 */

import type { TvType } from '../../core/types';

export const LIBRARY_STORAGE_KEY = 'csw.library.v1';
const MAX_FAVORITES = 100;
const MAX_RECENTS = 50;

export interface LibraryTitleRef {
  readonly providerId: string;
  /** Provider-scoped detail URL (opaque, carried verbatim). */
  readonly url: string;
  readonly name: string;
  readonly posterUrl: string;
  readonly type: TvType | string;
}

export interface FavoriteEntry extends LibraryTitleRef {
  readonly addedAt: number;
}

export interface RecentEntry extends LibraryTitleRef {
  /** Opaque episode token when the visit was episode-scoped. */
  readonly dataToken: string | null;
  /** Human label of the episode/playable, when known. */
  readonly label: string | null;
  readonly watchedAt: number;
}

export interface LibraryState {
  readonly favorites: readonly FavoriteEntry[];
  readonly recents: readonly RecentEntry[];
}

export const EMPTY_LIBRARY: LibraryState = { favorites: [], recents: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseTitleRef(value: unknown): LibraryTitleRef | null {
  if (!isRecord(value)) return null;
  const providerId = value['providerId'];
  const url = value['url'];
  const name = value['name'];
  const posterUrl = value['posterUrl'];
  const type = value['type'];
  if (
    typeof providerId !== 'string' ||
    typeof url !== 'string' ||
    typeof name !== 'string' ||
    typeof posterUrl !== 'string' ||
    typeof type !== 'string'
  ) {
    return null;
  }
  return { providerId, url, name, posterUrl, type };
}

function parseLibrary(raw: string | null): LibraryState {
  if (raw === null) return EMPTY_LIBRARY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_LIBRARY;
  }
  if (!isRecord(parsed)) return EMPTY_LIBRARY;
  const favoritesRaw = Array.isArray(parsed['favorites']) ? parsed['favorites'] : [];
  const recentsRaw = Array.isArray(parsed['recents']) ? parsed['recents'] : [];
  const favorites: FavoriteEntry[] = [];
  for (const entry of favoritesRaw) {
    const ref = parseTitleRef(entry);
    if (ref === null) continue;
    const addedAt = isRecord(entry) && typeof entry['addedAt'] === 'number' ? entry['addedAt'] : 0;
    favorites.push({ ...ref, addedAt });
    if (favorites.length >= MAX_FAVORITES) break;
  }
  const recents: RecentEntry[] = [];
  for (const entry of recentsRaw) {
    const ref = parseTitleRef(entry);
    if (ref === null) continue;
    const dataToken = isRecord(entry) && typeof entry['dataToken'] === 'string' ? entry['dataToken'] : null;
    const label = isRecord(entry) && typeof entry['label'] === 'string' ? entry['label'] : null;
    const watchedAt = isRecord(entry) && typeof entry['watchedAt'] === 'number' ? entry['watchedAt'] : 0;
    recents.push({ ...ref, dataToken, label, watchedAt });
    if (recents.length >= MAX_RECENTS) break;
  }
  return { favorites, recents };
}

function readStorage(): LibraryState {
  if (typeof window === 'undefined') return EMPTY_LIBRARY;
  try {
    return parseLibrary(window.localStorage.getItem(LIBRARY_STORAGE_KEY));
  } catch {
    return EMPTY_LIBRARY; // storage disabled/unavailable — library stays in-memory only
  }
}

function writeStorage(state: LibraryState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota/unavailable — non-fatal */
  }
}

let state: LibraryState = EMPTY_LIBRARY;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function setState(next: LibraryState, persist: boolean): void {
  state = next;
  if (persist) writeStorage(state);
  emitChange();
}

/** React-store contract: get snapshot (client) / subscribe. */
export function getLibrarySnapshot(): LibraryState {
  return state;
}

/** Server snapshot is always empty (library is device-local by definition). */
export function getServerLibrarySnapshot(): LibraryState {
  return EMPTY_LIBRARY;
}

export function subscribeLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Loads persisted state into the store; call once from a client effect. */
export function hydrateLibrary(): void {
  setState(readStorage(), false);
}

function sameTitle(a: LibraryTitleRef, b: LibraryTitleRef): boolean {
  return a.providerId === b.providerId && a.url === b.url;
}

export function isFavorite(providerId: string, url: string): boolean {
  return state.favorites.some((entry) => entry.providerId === providerId && entry.url === url);
}

export function toggleFavorite(ref: LibraryTitleRef, now: number = Date.now()): void {
  const existing = state.favorites.find((entry) => sameTitle(entry, ref));
  const favorites = existing
    ? state.favorites.filter((entry) => !sameTitle(entry, ref))
    : [{ ...ref, addedAt: now }, ...state.favorites].slice(0, MAX_FAVORITES);
  setState({ ...state, favorites }, true);
}

export function removeFavorite(providerId: string, url: string): void {
  setState(
    { ...state, favorites: state.favorites.filter((entry) => !sameTitle(entry, { providerId, url, name: '', posterUrl: '', type: '' })) },
    true,
  );
}

/** Records/refreshes a recent entry (most recent first, deduped per title). */
export function addRecent(
  ref: LibraryTitleRef,
  options: { dataToken?: string | null; label?: string | null; watchedAt?: number } = {},
): void {
  const watchedAt = options.watchedAt ?? Date.now();
  const entry: RecentEntry = {
    ...ref,
    dataToken: options.dataToken ?? null,
    label: options.label ?? null,
    watchedAt,
  };
  const recents = [entry, ...state.recents.filter((existing) => !sameTitle(existing, ref))].slice(0, MAX_RECENTS);
  setState({ ...state, recents }, true);
}

export function removeRecent(providerId: string, url: string): void {
  setState(
    { ...state, recents: state.recents.filter((entry) => !sameTitle(entry, { providerId, url, name: '', posterUrl: '', type: '' })) },
    true,
  );
}

/** Test/export helper: replaces the whole store (validated). */
export function setLibraryForTests(next: LibraryState): void {
  setState(next, false);
}
