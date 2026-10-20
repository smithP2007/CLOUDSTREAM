import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="empty-state" data-testid="not-found">
      <h1 style={{ marginTop: 0 }}>Page not found</h1>
      <p>
        The title, provider, or episode reference you followed does not exist in the installed
        catalog. The reference may be malformed or the provider may no longer be installed.
      </p>
      <p>
        <Link href="/">Back to home</Link> · <Link href="/search">Search titles</Link>
      </p>
    </section>
  );
}
