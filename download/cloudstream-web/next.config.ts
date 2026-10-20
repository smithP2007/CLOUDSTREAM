/**
 * Next.js 16 config for the Phase 5 web application (roadmap Phase 5).
 *
 * - The app lives in `src/app/` (App Router) inside the same package as the
 *   clean-room library; the LIBRARY build is unaffected (`tsc -p
 *   tsconfig.build.json` excludes `src/app`).
 * - `tsConfigPath` points at a dedicated TypeScript config so `next
 *   dev/build` NEVER rewrites the library's root `tsconfig.json` (the root
 *   config keeps `jsx: react-jsx` for the Vite demo; Next requires
 *   `preserve`, which must not leak into the demo build).
 * - React StrictMode is ON (decision D24): `usePlaybackController` is
 *   StrictMode-safe by design (it swaps a disposed controller during render;
 *   see src/player/usePlaybackController.ts and the component test that pins
 *   the no-duplicate-playlist-entry behavior under StrictMode).
 *
 * - Security headers + CSP are wired through `headers()` from the pure
 *   builder in `src/app/_lib/securityHeaders.ts` (decision D25) — one
 *   definition shared with the unit tests. Remaining recorded limitations
 *   (unsafe-inline until a nonce CSP, unpkg connect-src for the verified CDN
 *   fallback) live in that module's docblock and
 *   docs/deployment-requirements.md.
 * - Image optimizer domains stay unconfigured (the app uses plain <img> +
 *   local SVG posters).
 */
import type { NextConfig } from 'next';
import { buildSecurityHeaders } from './src/app/_lib/securityHeaders';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    tsconfigPath: 'tsconfig.next.json',
  },
  async headers() {
    const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders(environment).map((header) => ({
          key: header.key,
          value: header.value,
        })),
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      // Turbopack cannot bundle @ffmpeg/ffmpeg 0.12.15 (runtime-value Worker
      // URL defeats static analysis). The shims runtime-load the pinned,
      // self-hosted MIT ESM builds from /ffmpeg-lib/ instead — see
      // src/player/conversion/next-shims/. Vite/vitest are unaffected.
      '@ffmpeg/ffmpeg': './src/player/conversion/next-shims/ffmpeg-shim.ts',
      '@ffmpeg/util': './src/player/conversion/next-shims/util-shim.ts',
    },
  },
};

export default nextConfig;
