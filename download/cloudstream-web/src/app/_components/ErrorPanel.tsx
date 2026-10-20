'use client';

/**
 * Typed, retryable error panel. Used for provider-level failures that the
 * catalog reports as VALUES (never crashes): the message is ours, the retry
 * re-runs the server render.
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export interface ErrorPanelProps {
  readonly title: string;
  readonly message: string;
  /** Renders a "Try again" button that refreshes the server components. */
  readonly retryable?: boolean;
  readonly testId?: string;
}

export function ErrorPanel({ title, message, retryable = true, testId }: ErrorPanelProps) {
  const router = useRouter();
  const retry = useCallback(() => {
    router.refresh();
  }, [router]);
  return (
    <section className="panel error-panel" role="alert" data-testid={testId}>
      <h2>{title}</h2>
      <p>{message}</p>
      {retryable ? (
        <button type="button" className="btn" onClick={retry}>
          Try again
        </button>
      ) : null}
    </section>
  );
}
