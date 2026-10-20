// @vitest-environment jsdom
/**
 * Preference store + subtitle-language matching tests.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  getPrefsSnapshot,
  hydratePrefs,
  PREFS_STORAGE_KEY,
  setPreferredSubtitleLanguage,
} from '../src/app/_lib/prefs';
import { pickPreferredSubtitle } from '../src/player/subtitlePreference';
import type { SubtitleTrackView } from '../src/player/types';

beforeEach(() => {
  window.localStorage.clear();
});

describe('preferences store', () => {
  it('persists selections and clears them', () => {
    hydratePrefs();
    expect(getPrefsSnapshot()).toEqual(DEFAULT_PREFS);
    setPreferredSubtitleLanguage('en');
    expect(getPrefsSnapshot().preferredSubtitleLanguage).toBe('en');
    expect(JSON.parse(window.localStorage.getItem(PREFS_STORAGE_KEY) ?? '{}')).toEqual({
      preferredSubtitleLanguage: 'en',
    });
    // Re-hydration reads the persisted value back.
    hydratePrefs();
    expect(getPrefsSnapshot().preferredSubtitleLanguage).toBe('en');
    // Clearing removes the stored key entirely.
    setPreferredSubtitleLanguage(null);
    expect(window.localStorage.getItem(PREFS_STORAGE_KEY)).toBeNull();
    expect(getPrefsSnapshot().preferredSubtitleLanguage).toBeNull();
  });
});

describe('pickPreferredSubtitle', () => {
  const tracks: SubtitleTrackView[] = [
    { id: 't1', label: 'ja (jp.vtt)', language: 'ja', origin: 'provider', ready: false },
    { id: 't2', label: 'en (en.vtt)', language: 'en', origin: 'provider', ready: true },
    { id: 't3', label: 'en (SRT)', language: 'en (SRT)', origin: 'provider', ready: false },
  ];

  it('prefers an exact language match', () => {
    expect(pickPreferredSubtitle(tracks, 'en')).toBe('t2');
    expect(pickPreferredSubtitle(tracks, 'ja')).toBe('t1');
  });

  it('falls back to a language-prefix match in track order', () => {
    const onlySrt: SubtitleTrackView[] = [tracks[2] as SubtitleTrackView];
    expect(pickPreferredSubtitle(onlySrt, 'en')).toBe('t3');
  });

  it('returns null without a preference or without matches', () => {
    expect(pickPreferredSubtitle(tracks, null)).toBeNull();
    expect(pickPreferredSubtitle(tracks, undefined)).toBeNull();
    expect(pickPreferredSubtitle(tracks, 'de')).toBeNull();
    expect(pickPreferredSubtitle([], 'en')).toBeNull();
  });
});
