/**
 * Search route (roadmap Phase 5 route 2) — thin server wrapper around the
 * catalog layer; the client page fetches /api/search for live pagination.
 */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SearchClient } from '../_components/SearchClient';

export const metadata: Metadata = { title: 'Search' };

function SearchSkeleton() {
  return (
    <div aria-busy="true">
      <h1>Search</h1>
      <div className="skeleton skeleton-line w-80" />
      <div className="skeleton skeleton-line w-60" />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchClient />
    </Suspense>
  );
}
