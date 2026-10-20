/**
 * Empty-state block (pure presentational, server or client safe).
 */

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  readonly title: string;
  readonly children?: ReactNode;
  readonly testId?: string;
}

export function EmptyState({ title, children, testId }: EmptyStateProps) {
  return (
    <section className="empty-state" data-testid={testId}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
