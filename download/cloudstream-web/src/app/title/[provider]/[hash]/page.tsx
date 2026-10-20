/**
 * Title detail page (roadmap Phase 5 route 3): `/title/[provider]/[hash]`.
 * The hash is a base64url token carrying the provider-opaque detail URL.
 * Renders poster, description, metadata, supported content types, episodes
 * (per season / dub status), recommendations, and the favorite toggle.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTitle } from '../../../../server/catalog';
import { toCardViews } from '../../../../server/catalog/views';
import { CatalogRow } from '../../../_components/CatalogRow';
import { EpisodeNav } from '../../../_components/EpisodeNav';
import { ErrorPanel } from '../../../_components/ErrorPanel';
import { FavoriteButton } from '../../../_components/FavoriteButton';
import { decodeToken } from '../../../_lib/codec';
import { watchHref } from '../../../_lib/links';
import type { LoadResponse } from '../../../../core/types';
import { formatRuntime } from '../../../_lib/format';

interface TitlePageProps {
  params: Promise<{ provider: string; hash: string }>;
}

export async function generateMetadata({ params }: TitlePageProps): Promise<Metadata> {
  const { provider, hash } = await params;
  const detailUrl = decodeToken(hash);
  if (detailUrl === null) return { title: 'Title not found' };
  const result = await getTitle(provider, detailUrl);
  return { title: result.ok ? result.data.name : 'Title not found' };
}

function TitleBody({ providerId, response }: { providerId: string; response: LoadResponse }) {
  const {
    name,
    url,
    type,
    posterUrl,
    year,
    plot,
    tags,
    duration,
    actors,
    recommendations,
    syncData,
    comingSoon,
  } = response;
  const runtime = formatRuntime(duration);
  return (
    <>
      <section className="title-hero">
        <div>
          {posterUrl ? <img src={posterUrl} alt={`${name} poster`} width={300} height={450} /> : null}
        </div>
        <div>
          <p className="hero-kicker">{type}</p>
          <h1 style={{ margin: '0 0 4px' }}>{name}</h1>
          <div className="title-meta">
            {year != null ? <span className="badge">{year}</span> : null}
            {runtime ? <span className="badge">{runtime}</span> : null}
            <span className="badge badge-accent">{providerId}</span>
            {comingSoon === true ? <span className="badge badge-warn">Coming soon</span> : null}
          </div>
          {plot ? <p className="title-plot">{plot}</p> : null}
          {tags != null && tags.length > 0 ? (
            <div className="chip-row" aria-label="Tags">
              {tags.map((tag) => (
                <span key={tag} className="badge">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {actors != null && actors.length > 0 ? (
            <>
              <h2 style={{ fontSize: '1.05rem', margin: '18px 0 4px' }}>Cast</h2>
              <ul className="actor-list">
                {actors.map((actor) => (
                  <li key={actor.name}>
                    <b>{actor.name}</b>
                    {actor.role ? ` — ${actor.role}` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {syncData != null && Object.keys(syncData).length > 0 ? (
            <div className="chip-row" aria-label="Tracker IDs">
              {Object.entries(syncData).map(([tracker, id]) => (
                <span key={tracker} className="badge">
                  {tracker}: {id}
                </span>
              ))}
            </div>
          ) : null}
          <div className="hero-actions" style={{ marginTop: 18 }}>
            <FavoriteButton ref_={{ providerId, url, name, posterUrl: posterUrl ?? '', type }} />
          </div>
        </div>
      </section>

      {response.kind === 'tvSeries' ? (
        <>
          <div className="section-head">
            <h2>Episodes</h2>
          </div>
          {response.episodes.length === 0 ? (
            <p style={{ color: 'var(--csw-muted)' }}>The provider returned no episodes.</p>
          ) : (
            <EpisodeNav providerId={providerId} titleUrl={url} episodes={response.episodes} />
          )}
        </>
      ) : null}

      {response.kind === 'anime'
        ? (Object.entries(response.episodes)).map(([dub, episodes]) =>
            episodes === undefined ? null : (
              <div key={dub}>
                <div className="section-head">
                  <h2>Episodes ({dub})</h2>
                </div>
                <EpisodeNav
                  providerId={providerId}
                  titleUrl={url}
                  episodes={episodes}
                  groupLabel={`${dub} voice track`}
                />
              </div>
            ),
          )
        : null}

      {(response.kind === 'movie' || response.kind === 'liveStream') && comingSoon !== true ? (
        <>
          <div className="section-head">
            <h2>Watch</h2>
          </div>
          <p>
            <Link className="btn btn-primary" href={watchHref(providerId, url, response.dataUrl)}>
              {response.kind === 'liveStream' ? 'Open live stream' : 'Play now'}
            </Link>
          </p>
        </>
      ) : null}

      {recommendations != null && recommendations.length > 0 ? (
        <CatalogRow name="More like this" items={toCardViews(recommendations)} />
      ) : null}
    </>
  );
}

export default async function TitlePage({ params }: TitlePageProps) {
  const { provider, hash } = await params;
  const detailUrl = decodeToken(hash);
  if (detailUrl === null) notFound();

  const result = await getTitle(provider, detailUrl);
  if (!result.ok) {
    if (result.error.kind === 'not-found') notFound();
    return (
      <ErrorPanel
        title={result.error.kind === 'provider-disabled' ? 'Provider disabled' : 'Could not load this title'}
        message={result.error.message}
      />
    );
  }
  return <TitleBody providerId={provider} response={result.data} />;
}
