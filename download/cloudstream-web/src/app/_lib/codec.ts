/**
 * Route-token codec (isomorphic): encodes provider-opaque strings (detail
 * URLs, episode `data` tokens) into URL-safe base64url path segments and
 * decodes them back strictly.
 *
 * Used ONLY to carry opaque contract values through Next.js route params —
 * the app never inspects the payload (the `Episode.data` opacity rule from
 * the Phase 1 contract). The decoder validates canonically (roundtrip check)
 * so tampered or hand-edited segments fail closed to `null`.
 */

export function encodeToken(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeToken(token: string): string | null {
  if (token.length === 0 || !/^[A-Za-z0-9_-]*$/.test(token)) return null;
  let binary: string;
  try {
    binary = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  // Canonicality check: reject tokens that do not re-encode to themselves
  // (e.g. wrong padding, non-canonical trailing bits).
  return encodeToken(decoded) === token ? decoded : null;
}
