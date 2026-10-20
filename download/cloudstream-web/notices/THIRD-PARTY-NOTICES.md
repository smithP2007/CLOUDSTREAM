# Third-party notices — conversion stack (served artifacts)

This file records the license obligations for the third-party code this
application LOADS IN THE BROWSER at runtime. It is committed to the repository
and staged next to the served wrapper copies by `npm run fixtures:web`
(`public/ffmpeg-lib/NOTICES.txt`). It is a deployment prerequisite, not
decoration: serving any of these artifacts to another person is conveying /
distribution, and these notices MUST ship with it
(`docs/deployment-requirements.md` §1).

The full repository-wide LICENSE/NOTICE audit (every bundled npm dependency,
hls.js, shaka-player, Next.js/React and the repository's own license choice)
is the recorded Phase 7 task gated by D15-F — nothing here pre-empts it.

## 1. FFmpeg WebAssembly core — `@ffmpeg/core` 0.12.10 (GPL-2.0-or-later)

- What it is: the WebAssembly build of FFmpeg used by the OPTIONAL client-side
  conversion feature. It is NEVER bundled or committed; it is loaded at
  runtime from a self-hosted path or the pinned CDN fallback.
- License of the artifact: **GPL-2.0-or-later** (the build embeds
  `--enable-gpl` with libx264/libx265; FFmpeg itself is LGPL-2.1-or-later, the
  configure flag makes the binary GPL). Evidence and the embedded configure
  line: `docs/media-compatibility.md` §5 (Task 11 audit, verified from the
  actual artifact).
- Pinned artifact digests (SHA-256, re-verified with `npm run verify:core`):
  - `ffmpeg-core.js` (ESM loader):
    `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3`
  - `ffmpeg-core.wasm`:
    `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7`
- The full **GNU General Public License v2** text is vendored verbatim in this
  directory (`GPL-2.0.txt`, from the SPDX license-list-data repository,
  sha256 `aaf135472f81c5b4a0dca9367e5bb5e9750032b5bebe5442b36e4c0a47430df3`).
- REMAINING OPERATOR OBLIGATION (cannot be closed in code): GPL conveying
  requires the complete corresponding source for the EXACT core build — the
  pinned upstream tarball plus the recorded configure line — to be offered
  alongside the served artifact, or a written offer valid for three years.
  See `docs/deployment-requirements.md` §1.

## 2. FFmpeg browser wrapper and utilities (MIT)

- `@ffmpeg/ffmpeg` 0.12.15 and `@ffmpeg/util` 0.12.2 — MIT. In the Next.js
  app they are served as self-hosted ESM copies from `public/ffmpeg-lib/`
  (staged by `scripts/copy-fixtures-web.mjs` from the pinned npm packages);
  these notices apply to the served copies.
- The npm packages ship no LICENSE file (verified against the installed
  artifacts); the packages declare `"license": "MIT"` in `package.json` and
  are Copyright (c) Jerome Wu <jeromewus@gmail.com> and contributors. The
  standard MIT permission notice applies to both packages:

  > Permission is hereby granted, free of charge, to any person obtaining a
  > copy of this software and associated documentation files (the "Software"),
  > to deal in the Software without restriction, including without limitation
  > the rights to use, copy, modify, merge, publish, distribute, sublicense,
  > and/or sell copies of the Software, and to permit persons to whom the
  > Software is furnished to do so, subject to the following conditions: The
  > above copyright notice and this permission notice shall be included in all
  > copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED
  > "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
  > NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
  > PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
  > HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
  > ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
  > CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
