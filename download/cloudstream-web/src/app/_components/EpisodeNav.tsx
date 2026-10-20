/**
 * Episode navigation (title page + watch page): a server-rendered list of
 * episode links into /watch/... with the active episode marked
 * (aria-current) so keyboard/screen-reader users keep their place.
 */

import Link from 'next/link';
import type { Episode } from '../../core/types';
import { watchHref } from '../_lib/links';
import { episodeLabel, formatDate, formatRuntime } from '../_lib/format';

export interface EpisodeNavProps {
  readonly providerId: string;
  readonly titleUrl: string;
  readonly episodes: readonly Episode[];
  /** The opaque data token of the currently playing episode (watch page). */
  readonly activeData?: string | null;
  readonly groupLabel?: string;
}

export function EpisodeNav({ providerId, titleUrl, episodes, activeData = null, groupLabel }: EpisodeNavProps) {
  return (
    <div className="episode-group" aria-label={groupLabel ?? 'Episodes'}>
      {groupLabel ? <h3>{groupLabel}</h3> : null}
      <ol className="episode-list">
        {episodes.map((episode) => {
          const date = formatDate(episode.date);
          const runtime = formatRuntime(episode.runTime);
          const subParts = [date, runtime != null ? `${runtime} run time` : null].filter(
            (part): part is string => part !== null,
          );
          return (
            <li
              key={episode.data}
              className="episode-item"
              aria-current={episode.data === activeData ? 'true' : undefined}
            >
              <Link
                className="episode-link"
                href={watchHref(providerId, titleUrl, episode.data)}
                data-testid="episode-link"
              >
                <span className="episode-label">{episodeLabel(episode)}</span>
                {subParts.length > 0 ? <span className="episode-sub">{subParts.join(' · ')}</span> : null}
                {episode.description ? <span className="episode-sub">{episode.description}</span> : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
