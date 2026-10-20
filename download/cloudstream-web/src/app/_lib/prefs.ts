/**
 * Non-sensitive user preferences (decision D24): persisted locally in
 * localStorage, never transmitted. Currently: preferred subtitle language,
 * applied by the watch page when a matching provider/local track exists.
 */

import { useSyncExternalStore } from 'react';

export const PREFS_STORAGE_KEY = 'csw.prefs.v1';

export interface UserPrefs {
  /** BCP-47-ish language tag to auto-select, or null for no auto-selection. */
  readonly preferredSubtitleLanguage: string | null;
}

export const DEFAULT_PREFS: UserPrefs = { preferredSubtitleLanguage: null };

export const PREF_LANGUAGE_CHOICES = ['en', 'ja', 'es', 'fr', 'de'] as const;

function parsePrefs(raw: string | null): UserPrefs {
  if (raw === null) return DEFAULT_PREFS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFS;
    const lang = (parsed as Record<string, unknown>)['preferredSubtitleLanguage'];
    return { preferredSubtitleLanguage: typeof lang === 'string' && lang.length > 0 ? lang : null };
  } catch {
    return DEFAULT_PREFS;
  }
}

function readPrefs(): UserPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    return parsePrefs(window.localStorage.getItem(PREFS_STORAGE_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

let prefs: UserPrefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();

export function getPrefsSnapshot(): UserPrefs {
  return prefs;
}

export function getServerPrefsSnapshot(): UserPrefs {
  return DEFAULT_PREFS;
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hydratePrefs(): void {
  prefs = readPrefs();
  for (const listener of listeners) listener();
}

export function setPreferredSubtitleLanguage(language: string | null): void {
  prefs = { preferredSubtitleLanguage: language };
  try {
    if (typeof window !== 'undefined') {
      if (language === null) window.localStorage.removeItem(PREFS_STORAGE_KEY);
      else window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {
    /* non-fatal */
  }
  for (const listener of listeners) listener();
}

/** Convenience hook for client components. */
export function usePrefs(): { prefs: UserPrefs; setLanguage: (language: string | null) => void } {
  const snapshot = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, getServerPrefsSnapshot);
  return { prefs: snapshot, setLanguage: setPreferredSubtitleLanguage };
}
