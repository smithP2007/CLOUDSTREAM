/**
 * Providers status page (roadmap Phase 5 task 4): installed providers with
 * health + kill-switch display. Values are computed server-side at request
 * time; the admin/mutation surface is intentionally absent (D19, POLICY §2).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { getProviderStatuses } from '../../server/catalog';

export const metadata: Metadata = { title: 'Providers' };

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle (no calls observed yet)',
  ok: 'Healthy',
  degraded: 'Degraded (recent failures)',
  down: 'Down (repeated failures)',
  disabled: 'Disabled by kill switch',
};

export default function ProvidersPage() {
  const providers = getProviderStatuses();
  return (
    <>
      <h1>Providers</h1>
      <p style={{ color: 'var(--csw-muted)' }}>
        Installed content-source adapters. The fixture provider below is a UI fixture backed by
        committed data — it implements the same contract and passes through the same host
        machinery (timeouts, boundary validation, kill switch) that real providers will use.
        Values refresh on page load.
      </p>
      <div className="status-grid">
        {providers.map((provider) => (
          <section key={provider.id} className="panel" aria-label={`Provider ${provider.name}`}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: 6 }}>
              <span className={`status-dot status-${provider.health.status}`} aria-hidden="true" />
              {provider.name}
            </h2>
            <p style={{ color: 'var(--csw-muted)', marginTop: 0 }}>
              {STATUS_LABEL[provider.health.status] ?? provider.health.status}
            </p>
            <table className="status-table">
              <tbody>
                <tr>
                  <th scope="row">Provider id</th>
                  <td>
                    <code>{provider.id}</code>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Language</th>
                  <td>{provider.lang}</td>
                </tr>
                <tr>
                  <th scope="row">Content types</th>
                  <td>{provider.tvTypes.join(', ')}</td>
                </tr>
                <tr>
                  <th scope="row">Calls / successes</th>
                  <td>
                    {provider.health.totalCalls} / {provider.health.totalSuccesses}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Failures / skipped</th>
                  <td>
                    {provider.health.totalFailures} / {provider.health.skippedCalls}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Avg. call duration</th>
                  <td>
                    {provider.health.averageDurationMs != null
                      ? `${provider.health.averageDurationMs} ms`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Kill switch</th>
                  <td>
                    {provider.killSwitch.enabled
                      ? provider.killSwitch.globallyDisabled
                        ? 'Enabled (global disable active)'
                        : 'Enabled'
                      : `Disabled — ${provider.killSwitch.reason ?? 'no reason recorded'}`}
                  </td>
                </tr>
              </tbody>
            </table>
            <p style={{ marginBottom: 0 }}>
              <Link href={`/search?q=${encodeURIComponent(provider.name.split(' ')[0] ?? '')}`}>
                Search this provider’s catalog
              </Link>{' '}
              · <a href="/api/providers/health">Health API (machine-readable)</a>
            </p>
          </section>
        ))}
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>About the kill switch</h2>
        <p style={{ color: 'var(--csw-muted)' }}>
          The kill switch mirrors the upstream <code>SitePlugin.status</code> pattern: a disabled
          provider is never invoked — calls are refused before the provider runs and recorded as
          skipped. This page is display-only on purpose: enabling/disabling providers remotely
          requires the authenticated admin surface, which is a separate gated decision (D19,
          POLICY.md §2).
        </p>
      </section>
    </>
  );
}
