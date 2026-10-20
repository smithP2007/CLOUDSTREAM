# Internet Archive fixtures — provenance and status (D20)

**Status on 2026-10-21:** the files in this directory are **shape specimens
pinned to the documented evidence base** of `docs/phase3-preflight-checklist.md`
(E1/E2/E3 VERIFIED official documentation, E14 INFERRED shapes) — they are NOT
byte-faithful live captures. The session that created them had no raw-HTTP
egress (the build sandbox blocks direct connections), so probe runs and live
payload capture were impossible. This is recorded honestly in the checklist
addendum (§12) and in D20.

**Required follow-up (Phase 3 exit criterion):** run `scripts/ia-probe.mjs`
from a session/machine WITH raw egress. It captures all eight live fixtures,
runs playback probes P2a–P2f, and verifies the rights-register identifiers.
Any schema drift between live payloads and these specimens is fixed in
`src/server/providers/internetarchive/schemas.ts` with the evidence tagged.

## Checklist §9.1 fixture status

| # | Fixture | Status | File |
|---|---|---|---|
| 1 | search-success | SPECIMEN (documented shape) | `search-success.json` |
| 2 | search-empty | SPECIMEN (documented shape) | `search-empty.json` |
| 3 | search-error | PENDING live capture (error shape undocumented — capture, don't assume) | — |
| 4 | metadata-success | SPECIMEN (documented shape, E3 fields) | `metadata-success.json` |
| 5 | metadata-missing | SPECIMEN (E3 VERIFIED: `[]`) | `metadata-missing.json` |
| 6 | metadata-error | PENDING live capture (error-field variant) | — |
| 7 | metadata-restricted | PENDING live capture (lending/access-restricted item) | — |
| 8 | scrape-page | SPECIMEN (E2 official example shape; 3-item specimen instead of the minimum-100 live page for repo weight) | `scrape-page.json` |

Tests consume ONLY these committed files (zero live calls, checklist §9.2).
The specimens deliberately include only fields the schemas map; unknown keys
are stripped by the D12 posture, so additional live fields are expected and
harmless.
