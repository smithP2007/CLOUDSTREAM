'use client';

/**
 * Route-level error boundary (Next.js App Router). Provider faults do NOT
 * reach this — the catalog reports them as typed values — so an error here
 * means an unexpected infrastructure failure. The message stays generic; the
 * digest is surfaced for correlation with server logs.
 */

import { useEffect } from 'react';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('route error', error.digest ?? error.message);
  }, [error]);
  return (
    <section className="panel error-panel" role="alert" data-testid="route-error">
      <h2>Something went wrong</h2>
      <p>The page failed unexpectedly. You can retry the render.</p>
      {error.digest ? (
        <p>
          <code>digest: {error.digest}</code>
        </p>
      ) : null}
      <button type="button" className="btn" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
