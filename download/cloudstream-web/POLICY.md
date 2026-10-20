# Project Policy — CloudStream-Inspired Web Application

**Status:** Adopted (Phase 0). Recorded in [`docs/decisions.md`](docs/decisions.md) as D1–D8.
**Applies to:** all code, providers, documentation, and deployment configurations in this repository.
**Evidence base:** `docs/repository-analysis.md`, `docs/web-compatibility-report.md` (risk register), `docs/implementation-roadmap.md` (Phase 0).

---

## 1. Product scope (D1)

The project is a **browser-based media application for PC** (movies, series, anime), inspired by the
architecture of [CloudStream](https://github.com/recloudstream/cloudstream) but **not** derived from its
code. It runs without the Android app: a web UI in the browser, with provider adapters executing
server-side. Desktop-native packaging, mobile apps, and cast/download features are out of scope for the
foreseeable roadmap.

## 2. Deployment posture (D2)

The initial deployment is a **private, self-hosted MVP** operated by the person who installed it (or a
small group they directly invite). Consequences that follow from this decision:

- The media relay (roadmap Phase 4) and admin surfaces must still be **authenticated**; "private" does
  not mean "no auth".
- There is no anonymous public audience at launch, which reduces (but does not remove) abuse exposure.
- **Any move to a public or shared deployment is a gate requiring a new decision** (D2-F), a legal
  review of the content-source set in actual use, and the abuse controls listed in §6.

## 3. Content-source policy (D3)

Permitted at launch, and only these categories:

1. **Public-domain content** (e.g. Internet Archive film collections).
2. **Creative Commons or similarly licensed content**, where the license permits streaming in this
   context and attribution requirements are honored.
3. **The operator's personal media** — content the operator already lawfully possesses and exposes via
   their own URLs/servers.
4. **Services whose APIs and terms of service permit the intended use** — verified per-service *before*
   a provider ships, not after. If the terms are silent, ambiguous, or prohibitive, the provider does
   not ship.

Prohibited as project content sources:

- Providers whose primary purpose is accessing pirated or unauthorized copies of copyrighted works.
- Any source that requires circumventing technical protection measures to access.
- The closed-source **AniKoto** extension or its derivatives as a code or binary source (see §5).

The initial reference providers (roadmap Phase 3) are Internet Archive plus open-API platforms of the
same lawful category as the official upstream extension set (Dailymotion, Invidious, Twitch, YouTube).
Adding any provider outside category §3 requires a new decision record and, where the terms are
unclear, a legal review **before** implementation begins.

## 4. Upstream code policy (D5, D6)

- **No copying of upstream CloudStream implementation code** (application, library, gradle plugin, or
  extensions — all GPL-3.0). The upstream repository is used as **read-only architectural
  specification and behavioral reference** (see the investigation documents). Clean-room rule: the
  TypeScript contract and providers are written from the *documented behavior* in `docs/`, not from
  upstream source on screen.
- **No reuse, redistribution, or decompilation-derived code from the AniKoto `.cs3` binary** or any
  other closed-source/unlicensed extension package. Static, black-box inspection performed during the
  investigation phase was used only to establish feasibility facts, recorded in
  `docs/web-compatibility-report.md` §4; none of its code, strings, or assets are reused.
- The upstream reference clone stays in `research/` (outside this project tree) and is never built,
  executed, modified, or vendored into this project.

## 5. Technical-conduct rules (D7, D8)

- **No DRM circumvention.** The project does not implement, integrate, or assist circumvention of DRM
  (Widevine, PlayReady, FairPlay) or of any technological protection measure. Encrypted-media handling
  is limited to non-DRM encryption that the browser stack handles natively (e.g. AES-128 in HLS via
  hls.js), and ClearKey via EME only if a future decision explicitly enables it for content the
  operator is licensed to decrypt. Provider responses indicating DRM-protected streams are out of
  scope and will not be processed.
- **No unrestricted streaming proxy.** The media relay is a scoped component, not an open proxy:
  authenticated users only, per-user quotas, request/range caps, no cross-user caching of protected
  media, no arbitrary-URL forwarding, and a provider-level kill switch. The relay exists to make
  *permitted* sources playable in a browser (CORS/referer constraints), not to anonymize or
  generalize access.
- **No execution of untrusted provider code.** Providers are first-party TypeScript in this
  repository (roadmap Phase 6 option A as the default posture). Any future dynamic/sandboxed provider
  model is a gated decision (D6-F) with a security review.

## 6. Operational commitments

- **License hygiene.** This repository ships its own license (selection pending, D15-F). A
  `NOTICE`/third-party license audit runs before any distribution of the software to others
  (roadmap Phase 7). Dependency licenses are recorded when added.
- **Takedown & abuse contact.** Before any deployment beyond the operator's private use, the operator
  must publish a contact channel for takedown/abuse reports and act on them. (Not required for a
  strictly private MVP; required the moment a second party accesses the deployment.)
- **Provider kill switch.** The host must support remotely disabling any installed provider
  (mirroring the verified upstream `SitePlugin.status` pattern, `RepositoryManager.kt:50–78`) so a
  misbehaving or legally problematic provider can be turned off without a redeploy.
- **Respect platform terms.** Providers honor `robots`-considerate fetch policies, rate limits, and
  the target service's terms. Where a service requires authentication for an API, credentials come
  from the operator's own accounts and are stored server-side only.

## 7. Policy change procedure

Any change to this policy requires a new entry (or superseding entry) in `docs/decisions.md` describing
what changed, why, and what new risks are accepted. Decisions marked **(F)** in `docs/decisions.md` are
explicitly *open for the future* and must not be resolved silently by implementation drift.
