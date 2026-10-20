# HANDOFF — Read This First (AI Continuation Guide)

You are continuing development of **cloudstream-web**: a clean-room, browser-oriented
TypeScript implementation of the *architecture* (not the code) of the CloudStream
Android app. This file tells you exactly where the project stands, what the rules are,
and what to build next. Full history of every work session is in
[`docs/worklog.md`](docs/worklog.md).

## 0. Non-negotiable rules

1. **Clean-room discipline.** This project must never contain code copied from
   CloudStream or any of its extensions. Upstream source was only studied read-only to
   produce behavioral documentation. All behavioral knowledge you need is already
   captured in `docs/` with commit-pinned citations — do not re-import upstream code.
2. **Read [`POLICY.md`](POLICY.md) in full before writing any code.** It defines scope,
   lawful content categories, the no-upstream-code rule, the no-AniKoto rule (closed
   source, no license — behavioral reimplementation only), no DRM circumvention, no
   anti-bot bypass, no unrestricted media proxy, and kill-switch/takedown commitments.
3. **Phase 3 gate.** Do NOT start real provider integrations or media playback until
   the current phase is complete, verified, and the user has explicitly approved moving
   on. This instruction comes from the project owner and is repeated in the roadmap.
4. **Never weaken the SSRF guard or registry matching** without recording a new
   decision in `docs/decisions.md` with explicit security limitations. These components
   are deliberately conservative and fail closed.
5. **Append a work record to `docs/worklog.md`** after every work session (template at
   the bottom of this file).

## 1. Required reading order

1. `POLICY.md` — the law of this project
2. `docs/decisions.md` — D1–D18: every adopted decision, divergence from upstream, and
   open questions (D16 registry matching, D17 registry hardening, D18 HTTP engine +
   SSRF posture with 9 explicit security limitations)
3. `docs/implementation-roadmap.md` — phase plan; contains "The exact next
   implementation task" section, which is authoritative for what to do next
4. `docs/repository-analysis.md`, `docs/provider-architecture.md`,
   `docs/web-compatibility-report.md` — the reverse-engineering investigation (behavior
   spec, not source to copy)
5. `docs/worklog.md` — what every previous session actually did and verified

## 2. Current state (verified green at handoff time)

- **Complete:** Phase 0 (policy + decisions), Phase 1 (core provider contract: types,
  Zod schemas, provider interface, link helpers, provider host, registry), Task A
  (registry security hardening, D17), Phase 2 steps 1–2 (undici HTTP engine +
  SSRF guard, D18), and Phase 2 steps 3–5 (parse toolkit with NO JS execution, link
  pipeline with TTL cache, observability + kill-switch, D19). Find these as commits titled
  "Phase 1 complete", "Task A: registry security hardening", "Task B: Phase 2 steps 1-2", and
  "Phase 2 steps 3-5" (match by subject — see the SHA note in `docs/worklog.md`).
- **Tests: 267/267 passing** across 11 files (`registry` 57, `http-guard` 43, `http-engine` 40,
  `observability` 23, `packer` 19, `link-pipeline` 16, `provider-host` 23, `contract` 14,
  `html` 12, `json` 10, `links` 10).
- `npm run typecheck` (tsc --noEmit), `npm run lint` (eslint), `npm run build`
  (tsc -p tsconfig.build.json → `dist/`) — all clean at handoff.
- **Stack:** Node >= 20 (developed on Node 24), pure ESM, TypeScript 5.9 (strict),
  zod ^4.6.7, undici ^8.12.3, cheerio ^1 (server-only HTML parsing), vitest ^5 (real timers),
  eslint 9 flat config.
- **Layout:**
  - `src/core/` — `types.ts`, `schemas.ts`, `provider.ts`, `links.ts`,
    `provider-host.ts`, `registry.ts`, `index.ts` (barrel)
  - `src/server/http/` — `engine.ts`, `guard.ts`, `dns.ts`, `headers.ts`, `cookies.ts`,
    `cache.ts`, `robots.ts`, `ip-types.ts`, `index.ts`
  - `src/server/parse/` — `html.ts`, `json.ts`, `packer.ts`, `index.ts`
  - `src/server/links/` — `pipeline.ts`, `index.ts`
  - `src/server/obs/` — `redact.ts`, `events.ts`, `kill-switch.ts`, `health.ts`, `index.ts`
  - `tests/` — one test file per module plus shared `helpers.ts` / `http-helpers.ts`
  - `dist/` — committed build output (ESM + .d.ts)
- **Commands:** `npm ci && npm test && npm run typecheck && npm run lint && npm run build`

## 3. The exact next task (Phase 3 gate — STOP first)

`docs/implementation-roadmap.md` now requires a **pre-flight inspection checklist** before ANY
provider code: for each candidate provider — (1) provider authorization mapped to POLICY.md §3,
(2) service terms verified + archived (ambiguous/prohibitive ⇒ do not ship), (3) data contracts
as recorded fixtures, (4) expected responses incl. error/rate-limit payloads, (5) playback
compatibility within D7/D8 (no DRM), (6) rate limits + robots posture, (7) unresolved risks with
mitigations or an explicit "do not build". Present the completed checklist to the owner and wait
for approval. After approval, task 1 = Internet Archive reference provider, composed from
`HttpEngine` + parse toolkit + `LinkPipeline` + observability wrapper + registry, with the
unshorten-BEFORE-registry-lookup pre-step (D16/D17) implemented through the engine.

## 4. Gotchas learned the hard way (details in docs/decisions.md D17/D18/D19)

- Registry matching is **host-scoped** (D17): prefix stage plus explicit subdomain check
  plus a structural mirror rule. Never reintroduce full-URL fuzzy containment — that
  let hostile suffixes like `example.com.evil.io` hijack a provider.
- Guard/engine (D18):
  - WHATWG URL keeps brackets on IPv6 hostnames — strip before classifying.
  - IPv4-mapped IPv6 (`::ffff:127.0.0.1`) has `0xffff` at group 5 — group-index bugs
    here classify loopback as PUBLIC (this exact bug was caught by a test).
  - DNS validation must run before the robots gate on every hop, or DNS errors get
    masked.
  - Injected DNS resolvers must carry the same `approvedDestinations` as the engine
    (documented contract).
  - undici pools sockets per origin, so DNS re-pinning tests must use fresh origins.
- Tests use **real timers**; loopback test servers bind 127.0.0.1 and are allowed
  explicitly via `approvedDestinations` — no test ever contacts real private/metadata
  addresses.
- **There is no JavaScript execution anywhere in this project** (D19): no `eval`, no
  `new Function`, no `node:vm`. The `p/a/c/k/e` unpacker is a pure static string transform;
  its output is untrusted DATA. General JS execution is deferred behind a separately
  isolated runtime + security review (D6-F gate) — do not reintroduce it silently.
- The link pipeline NEVER caches credential-bearing links (authorization/cookie/token
  headers) under the shared scope — preserve that invariant when touching `src/server/links/`.

## 5. What is intentionally NOT in this repo

- **Upstream source code** (CloudStream / extensions clones) and the inspected AniKoto
  binary — excluded by policy. The docs are written to be self-sufficient: every
  upstream behavior is described with file/line citations and VERIFIED/INFERRED/UNKNOWN
  tags. Treat any need to "check upstream" as a prompt to rely on the docs instead.
- **Secrets / environment files** — none are committed. Keep it that way.

## 6. Work record protocol

After each session, append to `docs/worklog.md` (do not overwrite earlier entries):

```markdown
---
Task ID: <next sequential number>
Agent: <agent name>
Task: <what you were asked to do>

Work Log:
- <concrete step 1>
- <concrete step 2>

Stage Summary:
- <key results / decisions / artifacts; include actual verification numbers>
```
