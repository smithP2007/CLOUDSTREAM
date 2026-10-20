'use client';

/**
 * Local library (roadmap Phase 5 route 5, LOCAL-ONLY per decision D24):
 * favorites + recent playback persisted in localStorage, plus the local user
 * preferences (preferred subtitle language). Nothing here is transmitted;
 * there is deliberately no server DB in this phase.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  EMPTY_LIBRARY,
  LIBRARY_STORAGE_KEY,
  getLibrarySnapshot,
  getServerLibrarySnapshot,
  hydrateLibrary,
  removeFavorite,
  removeRecent,
  subscribeLibrary,
} from '../_lib/library';
import { PREF_LANGUAGE_CHOICES, usePrefs } from '../_lib/prefs';
import { titleHref, watchHref } from '../_lib/links';
import { EmptyState } from './EmptyState';

type Tab = 'favorites' | 'recents';

function relativeTime(timestamp: number, now: number): string {
  const delta = Math.max(0, now - timestamp);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

export function LibraryClient() {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>('favorites');
  const [now, setNow] = useState(() => Date.now());
  const { prefs, setLanguage } = usePrefs();

  useEffect(() => {
    hydrateLibrary();
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const library = useSyncExternalStore(subscribeLibrary, getLibrarySnapshot, getServerLibrarySnapshot);
  const favorites = mounted ? library.favorites : EMPTY_LIBRARY.favorites;
  const recents = mounted ? library.recents : EMPTY_LIBRARY.recents;

  return (
    <>
      <h1 style={{ marginBottom: 0 }}>Library</h1>
      <p style={{ color: 'var(--csw-muted)', marginTop: 4 }}>
        Stored only in this browser ({LIBRARY_STORAGE_KEY}) — never transmitted to the server.
      </p>

      <div className="library-tabs" role="tablist" aria-label="Library sections">
        {(['favorites', 'recents'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={tab === candidate}
            className={`btn${tab === candidate ? ' btn-primary' : ''}`}
            onClick={() => setTab(candidate)}
            data-testid={`library-tab-${candidate}`}
          >
            {candidate === 'favorites' ? `Favorites (${favorites.length})` : `Recent (${recents.length})`}
          </button>
        ))}
      </div>

      {tab === 'favorites' ? (
        favorites.length === 0 ? (
          <EmptyState title="No favorites yet" testId="library-empty-favorites">
            <p>
              Open any <Link href="/search">title</Link> and use “Add to library” — favorites stay
              on this device.
            </p>
          </EmptyState>
        ) : (
          <ul className="library-list" data-testid="library-favorites">
            {favorites.map((entry) => (
              <li key={`${entry.providerId}:${entry.url}`} className="library-entry">
                <img src={entry.posterUrl} alt="" width={56} height={84} loading="lazy" />
                <div className="library-entry-main">
                  <Link className="library-entry-name" href={titleHref(entry.providerId, entry.url)}>
                    {entry.name}
                  </Link>
                  <span className="library-entry-sub">
                    {entry.type} · added {relativeTime(entry.addedAt, now)}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => removeFavorite(entry.providerId, entry.url)}
                  aria-label={`Remove ${entry.name} from favorites`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )
      ) : recents.length === 0 ? (
        <EmptyState title="Nothing watched yet" testId="library-empty-recents">
          <p>
            Play anything from the <Link href="/">home page</Link> — recently watched titles appear
            here so you can jump back in.
          </p>
        </EmptyState>
      ) : (
        <ul className="library-list" data-testid="library-recents">
          {recents.map((entry) => (
            <li key={`${entry.providerId}:${entry.url}`} className="library-entry">
              <img src={entry.posterUrl} alt="" width={56} height={84} loading="lazy" />
              <div className="library-entry-main">
                <Link className="library-entry-name" href={titleHref(entry.providerId, entry.url)}>
                  {entry.name}
                </Link>
                <span className="library-entry-sub">
                  {entry.label ?? entry.type} · watched {relativeTime(entry.watchedAt, now)}
                </span>
              </div>
              {entry.dataToken !== null ? (
                <Link
                  className="btn"
                  href={watchHref(entry.providerId, entry.url, entry.dataToken)}
                  aria-label={`Resume ${entry.name}${entry.label ? ` — ${entry.label}` : ''}`}
                >
                  Resume
                </Link>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => removeRecent(entry.providerId, entry.url)}
                aria-label={`Remove ${entry.name} from recents`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="panel" style={{ marginTop: 26 }} aria-label="Preferences">
        <h2>Preferences</h2>
        <p style={{ color: 'var(--csw-muted)' }}>
          Saved locally ({'csw.prefs.v1'}) and applied on the watch page when a matching subtitle
          track exists. An explicit in-player subtitle choice always wins.
        </p>
        <label className="field" style={{ maxWidth: 320 }}>
          <span>Preferred subtitle language</span>
          <select
            className="select"
            value={prefs.preferredSubtitleLanguage ?? ''}
            onChange={(event) => setLanguage(event.target.value === '' ? null : event.target.value)}
            data-testid="pref-subtitle-language"
          >
            <option value="">None</option>
            {PREF_LANGUAGE_CHOICES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
      </section>
    </>
  );
}
