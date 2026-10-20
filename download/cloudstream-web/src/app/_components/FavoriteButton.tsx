'use client';

/**
 * Favorite toggle backed by the local library store (localStorage only,
 * decision D24). Renders honest state: favorite/added + aria-pressed.
 */

import { useSyncExternalStore } from 'react';
import {
  getLibrarySnapshot,
  getServerLibrarySnapshot,
  hydrateLibrary,
  subscribeLibrary,
  toggleFavorite,
} from '../_lib/library';
import type { LibraryTitleRef } from '../_lib/library';
import { useEffect, useState } from 'react';

export interface FavoriteButtonProps {
  readonly ref_: LibraryTitleRef;
}

export function FavoriteButton({ ref_: titleRef }: FavoriteButtonProps) {
  // Hydrate once on mount (client-only storage), then read reactively.
  useEffect(() => {
    hydrateLibrary();
  }, []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const library = useSyncExternalStore(subscribeLibrary, getLibrarySnapshot, getServerLibrarySnapshot);
  const favorited = mounted && library.favorites.some((entry) => entry.providerId === titleRef.providerId && entry.url === titleRef.url);

  return (
    <button
      type="button"
      className={`btn${favorited ? ' btn-favorited' : ''}`}
      aria-pressed={favorited}
      onClick={() => toggleFavorite(titleRef)}
      data-testid="favorite-button"
    >
      {favorited ? '★ In your library' : '☆ Add to library'}
    </button>
  );
}
