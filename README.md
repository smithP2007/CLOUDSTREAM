# cloudstream-web — monorepo

A clean-room, browser-based movie, series and anime application **inspired by**
[CloudStream](https://github.com/recloudstream/cloudstream): the upstream *architecture*
(contract, runtime, player) re-implemented in TypeScript for the browser — never the
upstream code. This repository is intentionally self-contained so any future session
(human or AI) can continue the work from this README, the handoff guide, and the
decision/worklog records alone.

## Where everything is

| Path | What it is |
|---|---|
| `download/cloudstream-web/` | **The project.** Next.js 16 web app + TypeScript library (source, tests, fixtures, docs) |
| `download/cloudstream-web/HANDOFF.md` | **AI continuation guide — read this first** |
| `download/cloudstream-web/README.md` | Detailed project README (architecture per phase, all commands) |
| `download/cloudstream-web/POLICY.md` | The law of the project: scope, lawful-content rules, technical-conduct rules |
| `download/cloudstream-web/docs/decisions.md` | Decision record D1–D24 plus explicitly open decisions |
| `download/cloudstream-web/docs/implementation-roadmap.md` | Phase plan and the authoritative "exact next task" |
| `download/cloudstream-web/docs/worklog.md` | Full work history of every session (template at the end) |
| `worklog.md` (repo root) | Session worklog mirror |
| `research/` | Read-only upstream **reference pointers only** (gitlinks — no upstream code is stored or distributed here) |

## Current status (as of 2026-10-20)

- **Phase 0–2 complete** — contract layer (`src/core/`), HTTP engine with SSRF/DNS-pinning
  guard (D18), parse toolkit (no JS execution, D19), link pipeline with scoped TTL cache,
  observability, provider kill switch.
- **Phase 4 task 2 complete + audited** — media player stack (`src/player/`): native/HLS/DASH
  engines, local files, ffmpeg.wasm conversion (REAL conversion verified in e2e), self-hosted
  pinned core with documented GPL serving obligations.
- **Phase 5 complete, awaiting owner review** — the Next.js 16 web application (D24):
  home / search / details / watch / library / providers over a deterministic mock fixture
  provider, wired exclusively through `ProviderHost` + `LinkPipeline` + observability.
- **Gated by design (do not start without owner approval):** Phase 3 real providers
  (D20 approval process + pre-flight checklist) and Phase 4 task 1 media relay (D8 scope).
- **Verification at handoff:** 395/395 vitest (22 files), 18/18 app e2e, 6/6 demo e2e
  (incl. 2 real ffmpeg.wasm conversion runs), tsc / eslint / library build / next build green.

## Quick start

```bash
cd download/cloudstream-web
npm ci
npm test && npm run typecheck && npm run lint && npm run build
npm run build:app && npm run start    # production Next app on :3000
```

## For AI sessions continuing this work

1. Read `download/cloudstream-web/HANDOFF.md` first, then `POLICY.md`,
   `docs/decisions.md`, `docs/implementation-roadmap.md`, and the worklogs — in that order.
2. Non-negotiables: never copy upstream CloudStream code; never weaken the SSRF guard,
   registry matching, link-pipeline cache scoping, or the D19 kill switch; never execute
   extracted provider JS (no `eval` / `new Function` / `node:vm`); fixtures-first tests
   (no live third-party calls in unit tests); evidence tags VERIFIED / INFERRED / UNKNOWN /
   CONTEXT; no unverified compatibility claims.
3. Respect phase gates: Phase 3 providers and the Phase 4 relay require explicit owner
   approval (D20 / D8). Stop for owner review at phase boundaries.
4. Append a work record to both worklogs (`docs/worklog.md` and root `worklog.md`) after
   each session.

## Branches

- `main` — authoritative branch with the latest history.
- `github-export` — preserved legacy export snapshot; older layout, fully superseded by
  `main` (kept for lineage only).

## Compliance summary

Clean-room: no upstream code copied; no compiled extension executed or decompiled for code
reuse; providers target lawful content only; no DRM circumvention; no unrestricted media
proxy; no anti-bot bypass. Full text: `download/cloudstream-web/POLICY.md`.
