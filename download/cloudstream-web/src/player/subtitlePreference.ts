/**
 * Subtitle-language preference matching (Phase 5): the app persists a
 * preferred subtitle language locally; this pure helper picks the matching
 * track id (exact tag first, then tag-prefix match in track order).
 * Selection itself stays an explicit controller action — the player never
 * silently changes an ACTIVE selection (it only fills an empty one).
 */

import type { SubtitleTrackView } from './types';

export function pickPreferredSubtitle(
  tracks: readonly SubtitleTrackView[],
  preferredLanguage: string | null | undefined,
): string | null {
  if (preferredLanguage === undefined || preferredLanguage === null || preferredLanguage.length === 0) {
    return null;
  }
  const pref = preferredLanguage.toLowerCase();
  let prefixMatch: string | null = null;
  for (const track of tracks) {
    const language = track.language.toLowerCase();
    if (language === pref) return track.id;
    if (prefixMatch === null && (language.startsWith(pref) || pref.startsWith(language))) {
      prefixMatch = track.id;
    }
  }
  return prefixMatch;
}
