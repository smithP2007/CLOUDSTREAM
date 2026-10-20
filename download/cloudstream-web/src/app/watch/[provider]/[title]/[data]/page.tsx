/**
 * Watch page (roadmap Phase 5 route 4): `/watch/[provider]/[title]/[data]`.
 * Both variable segments are base64url tokens carrying the provider-opaque
 * detail URL and episode `data` token — the app never inspects them.
 *
 * Server side: resolves the title (for header + episode navigation) and the
 * playable links/subtitles through the catalog layer (ProviderHost +
 * LinkPipeline: dedupe, quality sort, single-flight TTL cache). Client side:
 * the existing MediaPlayer handles source/quality selection, subtitles,
 * local files, and honest error reporting.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLinks, getTitle } from '../../../../../server/catalog';
import { ErrorPanel } from '../../../../_components/ErrorPanel';
import { EpisodeNav } from '../../../../_components/EpisodeNav';
import { WatchClient } from '../../../../_components/WatchClient';
import { decodeToken } from '../../../../_lib/codec';
import { episodeLabel as formatEpisodeLabel } from '../../../../_lib/format';
import type { Episode, LoadResponse } from '../../../../../core/types';

interface WatchPageProps {
  params: Promise<{ provider: string; title: string; data: string }>;
}

export async function generateMetadata({ params }: WatchPageProps): Promise<Metadata> {
  const { provider, title: titleHash, data } = await params;
  const detailUrl = decodeToken(titleHash);
  const dataToken = decodeToken(data);
  if (detailUrl === null || dataToken === null) return { title: 'Watch' };
  const result = await getTitle(provider, detailUrl);
  if (!result.ok) return { title: 'Watch' };
  const label = findEpisodeLabel(result.data, dataToken);
  return { title: label === null ? result.data.name : `${result.data.name} — ${label}` };
}

function flattenEpisodes(response: LoadResponse): readonly Episode[] {
  switch (response.kind) {
    case 'tvSeries':
      return response.episodes;
    case 'anime':
      return Object.values(response.episodes)
        .flat()
        .filter((episode): episode is Episode => episode !== undefined);
    default:
      return [];
  }
}

function findEpisodeLabel(response: LoadResponse, dataToken: string): string | null {
  const episode = flattenEpisodes(response).find((entry) => entry.data === dataToken);
  return episode === undefined ? null : formatEpisodeLabel(episode);
}

async function WatchBody({
  providerId,
  titleHash,
  titleToken,
  dataToken,
}: {
  providerId: string;
  /** The still-encoded URL token — used to build links back to the title page. */
  readonly titleHash: string;
  /** The DECODED detail URL — passed verbatim to the catalog (opacity kept). */
  readonly titleToken: string;
  /** The DECODED opaque episode data token. */
  readonly dataToken: string;
}) {
  const titleResult = await getTitle(providerId, titleToken);
  if (!titleResult.ok) {
    if (titleResult.error.kind === 'not-found') notFound();
    return (
      <ErrorPanel
        title={titleResult.error.kind === 'provider-disabled' ? 'Provider disabled' : 'Could not load this title'}
        message={titleResult.error.message}
      />
    );
  }
  const title = titleResult.data;
  const linksResult = await getLinks(providerId, dataToken);
  const episodeLabel = findEpisodeLabel(title, dataToken);
  const episodes = flattenEpisodes(title);

  return (
    <>
      <p style={{ margin: '0 0 4px' }}>
        <Link href={`/title/${encodeURIComponent(providerId)}/${titleHash}`}>← Back to {title.name}</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>
        {title.name}
        {episodeLabel !== null ? <span style={{ color: 'var(--csw-muted)' }}> — {episodeLabel}</span> : null}
      </h1>

      {!linksResult.ok ? (
        <ErrorPanel
          title={
            linksResult.error.kind === 'provider-disabled'
              ? 'Provider disabled'
              : linksResult.error.kind === 'not-found'
                ? 'Episode reference not recognized'
                : 'Could not resolve playback sources'
          }
          message={linksResult.error.message}
        />
      ) : (
        <WatchClient
          providerId={providerId}
          title={{ url: title.url, name: title.name, posterUrl: title.posterUrl ?? '', type: title.type }}
          episodeLabel={episodeLabel}
          dataToken={dataToken}
          links={linksResult.data.links}
          subtitles={linksResult.data.subtitles}
        />
      )}

      {episodes.length > 0 ? (
        <>
          <div className="section-head">
            <h2>Episodes</h2>
          </div>
          <EpisodeNav
            providerId={providerId}
            titleUrl={title.url}
            episodes={episodes}
            activeData={dataToken}
          />
        </>
      ) : null}

      {linksResult.ok ? (
        <section className="panel" style={{ marginTop: 20 }} aria-label="Available sources">
          <h2>Available sources</h2>
          <p style={{ color: 'var(--csw-muted)', marginTop: 0 }}>
            {linksResult.data.links.length} source{linksResult.data.links.length === 1 ? '' : 's'} and{' '}
            {linksResult.data.subtitles.length} subtitle track
            {linksResult.data.subtitles.length === 1 ? '' : 's'} resolved for this episode
            (deduplicated and quality-sorted by the link pipeline). Source and quality selection
            live in the player panel on the right; the player picks the best source by default and
            falls back on errors.
          </p>
          <ul>
            {linksResult.data.links.map((link) => (
              <li key={`${link.source}:${link.url}`}>
                <strong>{link.name}</strong> — {link.type.toUpperCase()}
                {link.quality != null ? `, ${link.quality}p` : ''}
                {link.headers != null && Object.keys(link.headers).length > 0
                  ? ' (requires headers a browser cannot send — will report relay-required)'
                  : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { provider, title: titleHash, data } = await params;
  const titleToken = decodeToken(titleHash);
  const dataToken = decodeToken(data);
  if (titleToken === null || dataToken === null) notFound();
  return <WatchBody providerId={provider} titleHash={titleHash} titleToken={titleToken} dataToken={dataToken} />;
}
