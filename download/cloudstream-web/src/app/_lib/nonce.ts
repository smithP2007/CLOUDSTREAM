/**
 * CSP nonce generation (D26).
 *
 * A fresh, unguessable, per-request nonce for the Content-Security-Policy
 * `script-src 'nonce-…'` source. The value uses the CSP `base64-value`
 * grammar (base64url alphabet, NO `=` padding — `=` is outside the CSP
 * nonce-source grammar, so the padded standard alphabet is avoided).
 *
 * Pure module (no Next.js imports) so the unit tests can pin the charset and
 * uniqueness directly; `src/proxy.ts` consumes it per request. Uses Web Crypto
 * (`crypto.getRandomValues`), which is available in the Next.js proxy runtime
 * and in Node >= 20 — no Node-only APIs, no polyfills.
 */

const NONCE_BYTES = 16; // 128 bits of entropy — CSP nonce best practice.

export function generateCspNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // btoa → standard base64; map to the base64url alphabet and strip padding
  // so the result is a valid CSP base64-value (A–Z a–z 0–9 - _).
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The CSP `base64-value` grammar the nonce must satisfy (CSP3 §nonce-source). */
export const CSP_NONCE_CHARSET = /^[A-Za-z0-9_-]+$/;
