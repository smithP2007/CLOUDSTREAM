'use client';

/**
 * Watch-page client island: hosts the EXISTING MediaPlayer (no fork, no
 * duplicate vocabulary — the PlaybackLink/SubtitleFile contracts flow
 * straight through) and wires two app-level concerns around it:
 *
 *  1. recent-playback recording into the LOCAL library store (localStorage
 *     only, decision D24 — nothing is transmitted);
 *  2. the preferred-subtitle-language user preference, passed down to the
 *     player's opt-in auto-selection.
 *
 * Local-file playback stays fully available via the player's own picker.
 */

import { useEffect } from 'react';
import { MediaPlayer } from '../../player/MediaPlayer';
import type { PlaybackLink, SubtitleFile } from '../../core/types';
import { addRecent } from '../_lib/library';
import { hydratePrefs, usePrefs } from '../_lib/prefs';

export interface WatchClientProps {
  readonly providerId: string;
  readonly title: {
    readonly url: string;
    readonly name: string;
    readonly posterUrl: string;
    readonly type: string;
  };
  /** Human label for the current episode/playable (recents display). */
  readonly episodeLabel: string | null;
  readonly dataToken: string;
  readonly links: readonly PlaybackLink[];
  readonly subtitles: readonly SubtitleFile[];
}

export function WatchClient({
  providerId,
  title,
  episodeLabel,
  dataToken,
  links,
  subtitles,
}: WatchClientProps) {
  const { prefs } = usePrefs();
  const { url, name, posterUrl, type } = title;
  useEffect(() => {
    // Load the locally persisted preference before reading it (device-local).
    hydratePrefs();
  }, []);
  useEffect(() => {
    addRecent(
      { providerId, url, name, posterUrl, type },
      { dataToken, label: episodeLabel },
    );
  }, [providerId, url, name, posterUrl, type, dataToken, episodeLabel]);

  return (
    <div data-testid="watch-client">
      <MediaPlayer
        links={links}
        subtitles={subtitles}
        showLocalPicker
        conversionCoreBaseUrl="/ffmpeg-core"
        preferredSubtitleLanguage={prefs.preferredSubtitleLanguage}
        autoStart
        ariaLabel={`${title.name}${episodeLabel ? ` — ${episodeLabel}` : ''}`}
      />
      <p style={{ color: 'var(--csw-muted)', fontSize: '0.88rem', marginTop: 10 }}>
        Sources are played directly from their origin (no media relay). Sources that would need
        request headers a browser cannot send report a typed relay-required error instead of
        being fetched. Local files you open here never leave your device.
      </p>
    </div>
  );
}
