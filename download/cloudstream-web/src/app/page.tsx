/**
 * Home page (roadmap Phase 5 route 1): featured hero + provider home rows
 * rendered as horizontally scrollable poster cards. Data comes exclusively
 * through the catalog layer (server component → ProviderHost → wrapped
 * provider); provider failures render as typed, retryable error panels.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { getHome, findProvider } from '../server/catalog';
import { toCardViews } from '../server/catalog/views';
import { CatalogRow } from './_components/CatalogRow';
import { ErrorPanel } from './_components/ErrorPanel';
import { titleHref } from './_lib/links';
import { MOCK_PROVIDER_ID } from '../server/providers/mock';

export const metadata = { title: 'Home' };

async function HomeContent() {
  const provider = findProvider(MOCK_PROVIDER_ID);
  const result = await getHome(MOCK_PROVIDER_ID, 1);
  if (!result.ok) {
    return (
      <ErrorPanel
        title={result.error.kind === 'provider-disabled' ? 'Provider disabled' : 'Could not load the catalog'}
        message={result.error.message}
      />
    );
  }
  const rows = result.data.lists;
  if (rows.length === 0) {
    return (
      <section className="empty-state">
        <h2>The catalog is empty</h2>
        <p>The installed provider returned no home rows.</p>
      </section>
    );
  }
  const featured = rows[0]?.items[0];
  return (
    <>
      {featured ? (
        <section className="hero" aria-label="Featured">
          <div className="hero-poster">
            {featured.posterUrl ? (
              <img src={featured.posterUrl} alt="" width={300} height={450} />
            ) : null}
          </div>
          <div>
            <p className="hero-kicker">Featured fixture</p>
            <h1 className="hero-title">{featured.name}</h1>
            <p className="hero-plot">
              Browse the deterministic fixture catalog below — every title plays from locally
              generated media or authorized public test streams. No real content providers are
              configured.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href={titleHref(MOCK_PROVIDER_ID, featured.url)}>
                Open details
              </Link>
              <Link className="btn" href="/search">
                Browse all titles
              </Link>
            </div>
          </div>
        </section>
      ) : null}
      {rows.map((row, index) => (
        <CatalogRow key={row.name} name={row.name} items={toCardViews(row.items)} priority={index === 0} />
      ))}
      {provider ? (
        <p className="section-link" style={{ marginTop: 22 }}>
          Installed provider: <Link href="/providers">{provider.name}</Link> ({provider.tvTypes.length} content
          types)
        </p>
      ) : null}
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the catalog">
      <div className="hero" style={{ minHeight: 220 }}>
        <div className="skeleton skeleton-poster" style={{ maxWidth: 220 }} />
        <div>
          <div className="skeleton skeleton-line w-60" />
          <div className="skeleton skeleton-line w-80" />
          <div className="skeleton skeleton-line w-60" />
        </div>
      </div>
      <div className="poster-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="skeleton skeleton-poster" key={i} />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
