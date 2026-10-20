# Phase 3 Pre-Flight Checklist — Internet Archive Provider

**Status:** DRAFT, revision 3 — for owner review. **NOT approved**; this revision does NOT authorize
implementation, and draft D20 (§11) is NOT adopted. No provider code exists or was written.
**Prepared:** 2026-10-20, after Phase 2 steps 1–5 complete (baseline commit `6fd80cc`; baseline
re-verified that session: 267/267 vitest tests, 11 files green; `typecheck`/`lint`/`build` clean).
Document lineage verified 2026-10-20 from actual repository state: revision 1 committed as
`33b3fe9`, revision 2 as `b01219a`; this revision 3 was prepared against the working tree at HEAD
`d75cdf1` — the latest commit touching this document before this pass is `b01219a`.
**Revision 2 (2026-10-20, owner-requested corrections):** playback/CORS model corrected (native
`<video>` vs JS-fetched playback); probe plan split into separate behaviors with
`Access-Control-Allow-Origin` demoted to diagnostic evidence; copyright posture strengthened to an
individually approved per-item rights register; robots.txt finding recorded (E24); unsupported-claim
sweep re-tagged. Terms-of-Use gate unchanged.
**Revision 3 (2026-10-20, owner-requested consistency pass):** §10/§11 contradiction resolved — D20
adoption is now explicitly preconditioned on a dated Terms-of-Use copy (P3/A1), an explicit review
of permitted read-only use, and a favorable conclusion; §6 (and one matching §5 sentence) retensed
so nothing implies probe P2a has already run — **no probe has been executed** and probe results
remain UNKNOWN; §8 destination policy tightened to per-item **verified** datanode destinations with
every redirect hop revalidated (a `*.us.archive.org` wildcard is a shape guard, never proof of an
approved media server); preparation note re-anchored to the verified repository revision. Evidence
tags, the evidence log, the rights-register requirement, and all stop conditions are unchanged; no
probe outcome is claimed anywhere.
**Method:** desk review of official Internet Archive documentation (see §0 evidence log). This session's
sandbox has no direct egress, so live behavior probes (playback, byte-range, redirects, codecs,
headers) could not be executed — they are recorded as explicit evidence gaps (§5, §6, §10) with a
probe plan (§9.3).
**Evidence tags used throughout:** **VERIFIED** (read from an official Internet Archive source on
2026-10-20, quoted or closely paraphrased), **INFERRED** (derived from official sources + our own design
decisions; must be pinned by a recorded fixture before any provider code merges), **UNKNOWN** (not
establishable this session; blocks specific claims, not the whole review), **CONTEXT** (public-record
background, not re-verified this session), **OWNER-PROVIDED** (stated by the project owner this
session; re-verified by the named probe before any reliance).

**Review rule honored:** nothing below is invented. Where a fact could not be verified, it says
UNKNOWN. A successful metadata lookup is **not** treated as proof of playback (§5), and an item being
indexed by archive.org is **not** treated as proof it is public domain (§1, §10 R2).

---

## 0. Evidence log (all accessed 2026-10-20)

| # | Source (official Internet Archive) | What it establishes | Tag |
|---|---|---|---|
| E1 | <https://archive.org/help/aboutsearch.htm> ("About Search") | advancedsearch.php parameters & usage; 10,000-row sorted-pagination cap; scrape API contract | VERIFIED |
| E2 | E1, scrape section | `/services/search/v1/scrape` params (q, fields, sorts, count, cursor, total_only), count min 100, cursor pagination, official JSON example, "no absolute guarantee that every item will be returned" | VERIFIED |
| E3 | <https://archive.org/developers/md-read.html> ("Item Metadata API: Read") | `GET https://archive.org/metadata/{identifier}`; response top-level fields; files-array entry fields; missing identifier ⇒ **empty array**; `error` field for other failures; partial reads | VERIFIED |
| E4 | <https://archive.org/developers/metadata.html> | MDAPI auth model: most metadata read is public; certain user-JSON fields require auth; write always requires auth; `Authorization: LOW` S3 keys vs cookies; "cookies should only be used by browsers and S3 keys for programmatic access"; read supports compression | VERIFIED |
| E5 | <https://archive.org/developers/bots.html> ("Bots, LLMs, and Automated Access") | mandatory descriptive User-Agent (tool + version); rate-limit guidance (delays for bulk, honor 429 + `Retry-After`, checksums, limited concurrency); best practices (cache responses, bulk endpoints, exponential backoff) | VERIFIED |
| E6 | <https://help.archive.org/help/rights> | IA "does not make guarantees as to the copyright status of items"; Terms of Use require use "at their own risk" and "non-infringing" use; uploader-supplied rights info; copyright-agent contact | VERIFIED |
| E7 | <https://help.archive.org/help/movies-and-videos-a-basic-guide/> | movie rights "vary from movie to movie", many uploader-designated CC; "Archive.org cannot guarantee the accuracy of uploader-provided information"; volunteer-compiled public-domain list has no guarantee; "Some files simply can't be streamed … unsupported media type" | VERIFIED |
| E8 | <https://help.archive.org/help/files-formats-and-derivatives/> | video items: "We will derive other file formats that are web-friendly such as h.264 mp4" | VERIFIED |
| E9 | <https://help.archive.org/help/internet-archive-access-policy> | access policy (universal access; ToU governs use; last updated Aug 29, 2023) | VERIFIED |
| E10 | <https://archive.org/developers/ias3.html> | S3-like API: "Archive is much more likely to issue 307 Location redirects than Amazon"; page also contains "Use Limits" and "Fast GET downloads" sections (upload-focused; not fully captured) | VERIFIED (307 quote) |
| E11 | <https://archive.org/developers/index-apis.html> | official API inventory (Bots page, MDAPI read/write, Changes API, Tasks API, etc.) | VERIFIED |
| E12 | <https://archive.org/developers/internetarchive/updates.html> + Python-lib docs | Tasks API exposes rate-limit introspection (`get_tasks_api_rate_limit`) — scoped to Tasks API, **not** to search/metadata | VERIFIED |
| E13 | E1 "Lucene-like queries" reference + community knowledge | search-field vocabulary (title, creator, collection, mediatype, year, subject, downloads, identifier, language) | INFERRED — pin via fixture |
| E14 | Solr-standard shape implied by E1/E2 | advancedsearch JSON response shape (`responseHeader`, `response.numFound/start/docs`) | INFERRED — pin via fixture |
| E15 | E3 gives `dir` + datanode hosts (`d1`/`d2`); community knowledge | download URL forms `https://archive.org/download/{id}/{file}` and datanode file URLs; poster endpoint `https://archive.org/services/img/{id}` | INFERRED — probe |
| E16 | — | `Access-Control-Allow-Origin` values on archive.org file hosts — DIAGNOSTIC only: native `<video>` playback of a progressive MP4 does not generally require CORS permission (no-cors media fetch); ACAO matters for JS-fetched playback (hls.js manifest/segment requests) and `crossorigin` uses (canvas/Web Audio) | UNKNOWN (no egress) — recorded as diagnostic evidence by probe P2f |
| E17 | — | byte-range support (`Accept-Ranges: bytes`, 206 responses) on file hosts — required for `<video>` seeking | UNKNOWN (no egress) — probe P2b |
| E18 | — | HLS (`.m3u8`) availability for video items; note JS-based HLS playback requires CORS on manifest + segments regardless of availability | UNKNOWN (no official doc captured) |
| E19 | — | numeric rate limits for search/metadata APIs | UNKNOWN (official guidance is qualitative only) |
| E20 | — | current Terms-of-Use full text (archive.org/about/terms is JS-gated; Wayback snapshot redirected to a "lite" version) | UNKNOWN — open action A1 |
| E21 | — | subtitle/caption file availability for movies | UNKNOWN (per-item only) |
| E22 | E4 (restricted metadata classes exist) + community knowledge | lending / access-restricted items require login and must be excluded | INFERRED — pin via fixture |
| E23 | Hachette v. Internet Archive (2nd Cir. 2024), UMG v. IA settlement | IA operates under active copyright-litigation pressure | CONTEXT — re-verify if posture changes |
| E24 | archive.org robots.txt (owner-provided observation, 2026-10-20; re-verified by probe P1 before reliance) | visible wildcard rules disallow `/control/` and `/report/`; the API paths this provider uses (`/advancedsearch.php`, `/metadata/`, `/download/`, `/services/`) are not visibly disallowed. robots.txt is an access-policy signal, NOT a substitute for reviewing terms (R1/A1) | OWNER-PROVIDED — re-verify in P1 |

---

## 1. Source authorization, API terms, and applicable content licensing

**Policy mapping (roadmap checklist item 1).** The proposed provider serves content category
**POLICY.md §3.1 (public-domain content)** and §3.2 (CC-licensed content), with the API itself falling
under §3.4 ("services whose APIs and terms of service permit the intended use"). It matches the
roadmap's Phase 3 build order #1 and the D3-approved initial source set. A new decision record
(**D20**, §11) is required before any code.

**What the Archive itself says about rights (E6, E7 — VERIFIED quotes):**

- "The Internet Archive does not make guarantees as to the copyright status of items on archive.org
  and cannot guarantee information posted on item details or collection pages regarding copyright or
  other intellectual property rights."
- The Terms of Use "require that users make use of the Internet Archive's Collections at their own
  risk and ensure that such use is non-infringing and in accordance with all applicable laws."
- For movies specifically: rights "vary from movie to movie but many of the films are licensed with
  Creative Commons Licenses" (uploader-designated), and "Archive.org cannot guarantee the accuracy of
  uploader-provided information."

**Consequence for us (design constraint, not a claim):** item-level rights status is heterogeneous
and uploader-asserted. The provider therefore cannot rely on "it is on archive.org" as a rights
basis, and **a collection-level allowlist alone is NOT sufficient** — membership in a public-domain
collection does not make every item in it public domain (IA collections mix works, and rights
metadata is uploader-asserted of varying quality, E6/E7). The rights posture is two-layered:

1. **Collection pool (necessary, not sufficient).** Curated public-domain collections bound what
   the search layer may surface at all (exact marker fields INFERRED, pinned by fixtures per §9).
2. **Per-item rights register (mandatory).** Only individually approved item identifiers may be
   served. Each register entry records: the identifier; the rights evidence actually reviewed
   (e.g. publication date/pre-copyright status, copyright-renewal research, the item's
   `licenseurl`/CC pointer and restricted-rights markers); the concluded permission scope (e.g.
   "public domain — no restrictions" or "CC BY — attribution as specified"); attribution
   requirements; the review date; and the reviewer. Uploader-provided license metadata (CC logos,
   `licenseurl`, rights fields) is **evidence to review, not an automatic guarantee** of ownership
   or permission (E6/E7 explicitly disclaim it). The register lives in
   `docs/evidence/ia-rights-register.md`; `load()`/`loadLinks()` must refuse any identifier absent
   from it (defense in depth on top of search filtering). IA's referenced public-domain film list
   (E7) is itself explicitly no-guarantee: it may inform review, never replace it.

**API terms for automated access (E5, E4 — VERIFIED):** the Archive publishes a Bots/LLMs/Automated
Access policy requiring descriptive User-Agent identification and qualitative rate-limiting
discipline (§7), and documents public, unauthenticated read access to metadata ("most information
returned by Metadata Read is publicly available", E4). No clause prohibiting read-only API search or
metadata retrieval for a client application was found in the official pages captured this session.
**However — and this gate is preserved — the public accessibility of an API, and its non-exclusion
by robots.txt (E24), do NOT establish that every proposed application use is permitted.** The full
current Terms of Use could not be captured (E20); its archived dated copy is **action A1**, and the
ToU review — not robots.txt, not API availability — is the authority on permission (mirrors the
roadmap rule that ambiguity must be resolved, or the provider does not ship).

**Out of scope from minute one (POLICY §3 prohibitions, D7/D8):** lending / controlled-digital-lending
items and any content requiring an archive.org account (E22), torrent/magnet delivery (excluded from
our `PlaybackLinkType` v1), and any DRM-protected item (none exists in IA public video, but the gate
is stated anyway).

**Tag summary for §1:** authorization category VERIFIED (D3/POLICY); terms permitting read-only API
use UNRESOLVED — pending the ToU snapshot (E20/A1 gate); content licensing per-item
UNKNOWN-with-mitigation (collection pool + mandatory per-item rights register).

---

## 2. Official API endpoints and documented request/response formats

All endpoints below are read-only, unauthenticated GETs. Authentication is deliberately NOT used in
v1 (§8).

| Capability | Endpoint (method) | Parameters | Response (documented) | Tag |
|---|---|---|---|---|
| Catalog search | `GET https://archive.org/advancedsearch.php` | `q` (Lucene-like), `output=json`, `rows`, `page`, `sort`, `fl` (E1) | JSON; shape `responseHeader` + `response{numFound, start, docs[]}` per E14 | params VERIFIED; response shape INFERRED (fixture) |
| Deep pagination / bulk | `GET https://archive.org/services/search/v1/scrape` | `q`, `fields` (comma-list), `sorts` (identifier last), `count` (min 100), `cursor`, `total_only` (E2) | `{items:[…], total, count, cursor}` — official example shows `"items":[{"title":…,"identifier":…}], "total":198879, "count":100, "cursor":"W3si…"}` (E2) | VERIFIED |
| Search schema (machine-readable) | `GET https://archive.org/services/search/v1` | — | Swagger/OpenAPI description of scrape fields (E1/E2) | VERIFIED |
| Item metadata | `GET https://archive.org/metadata/{identifier}` (partial reads like `…/metadata/{id}/files/0` documented) | — | top-level: `created, d1, d2, dir, files[], files_count, item_last_updated, item_size, metadata, server, uniq, workable_servers[]` (E3). **Missing identifier ⇒ empty array `[]`, not 404**; other failures ⇒ `error` field (E3) | VERIFIED |
| File entry fields | in `files[]` | — | `name, source ("original"), format, mtime, size, md5, crc32, sha1` (E3); video items additionally carry format names like "h.264" derivatives (E8) and typically `length`, `height`, `width` (INFERRED — fixture) | fields VERIFIED (core set) |
| Poster image | `GET https://archive.org/services/img/{identifier}` | — | image | INFERRED (E15) — probe |
| File download | `GET https://archive.org/download/{identifier}/{filename}` | — | 30x redirect to a datanode (see §6); ias3 doc notes "Archive is much more likely to issue 307 Location redirects than Amazon" (E10) | INFERRED (E15); redirect behavior VERIFIED on ias3 |
| Item identity | details page `https://archive.org/details/{identifier}` | — | human page; used only as `url` value, never scraped | VERIFIED as canonical item URL (E3/E7 usage) |

**Pagination semantics.** advancedsearch is page/rows based with the official cap: "We limit the
number of sorted paged results returnable to 10,000. Paged sorted results are supported only until
the 10,000th result." (E1, VERIFIED). Our `search(query, page)` contract pages by `page + 1` while
`hasNext` — a page cap of e.g. rows=50 × 200 pages sits far under the documented ceiling.
`hasNext` is derived from `numFound` vs fetched rows (INFERRED shape, fixture-pinned). The scrape
API (cursor-based, min count 100) is the better tool for **homepage rows** (e.g. newest items in a
curated collection) than deep `page` jumps; it is officially intended for deep paging (E1).

**Query fields (E13 — INFERRED).** The search vocabulary we plan to use: `mediatype:movies`,
`collection:{CURATED}`, `title:`, `year:`, `language:`, `subject:`, `downloads` (sort), `identifier`.
Pinned by fixture; anything beyond this list is not used.

---

## 3. Example search results, item details, and metadata required by our TypeScript contract

Our contract surface (from `src/core/`) that must be filled: `SearchResponse`, `SearchPage{items,
hasNext}`, `LoadResponse` (movie variant: `MovieLoadResponse{dataUrl}`), `Episode{data, name,
season, episode, posterUrl, description, date, runTime}`, `PlaybackLink`, `SubtitleFile`.

**Search (advancedsearch `docs[]` → `SearchResponse`).** Planned mapping, INFERRED per-field until
fixtures pin the exact response:

| IA field | Contract field | Note |
|---|---|---|
| `identifier` | `url` (as `https://archive.org/details/{identifier}`) and `id` | provider-scoped detail URL, opaque to host |
| `title` | `name` | may be missing → item skipped (D12 strict-but-shallow boundary) |
| `mediatype:movies` + curated collection | `type` (`'Movie'` or `'Documentary'`) | decision: collections curated for single-work items |
| `year` | `year` on details; optional on search | |
| `description` | `plot` (details) | search-time description is often truncated HTML → stripped server-side via parse toolkit |
| `creator` | `actors` (as `{name}`) on details | role info not supplied by IA |
| `downloads` | not mapped | no contract field; could rank homepage rows later |

`providerName` = `'InternetArchive'`; `posterUrl` = services/img endpoint (E15, INFERRED);
`quality`/`score` left null (IA supplies no normalized 0–10 score — do not fabricate one).

**Item details (`metadata` object → `MovieLoadResponse`).** Planned mapping: `metadata.title` →
`name`; `metadata.year` (may be a range string like "1953" / "1953-1959" — parse defensively) →
`year`; `metadata.description` → `plot` (HTML-stripped); `metadata.collection` (string or array) →
`tags`; `metadata.runtime` (when present, format "HH:MM:SS") → `duration` in minutes; `licenseurl` →
rights-register input (evidence to review per §1 — not surfaced). `dataUrl` is a **provider-internal JSON blob** `{identifier, fileName}`
naming the chosen derivative file (opaque per contract; mirrors the upstream pattern where
`Episode.data` may be a JSON payload — verified upstream behavior, our docs §2.2).

**Files list (`files[]` → playback candidates).** Each video-format entry contributes a candidate
for `loadLinks`: `name` → file path; `format` → codec class (prefer "h.264" family per E8); `size`
→ sanity cap; `length`/`height` (INFERRED fields) → quality number for `PlaybackLink.quality`.

**Validation boundary.** Every payload crosses the Phase 2 boundary machinery: size-capped
`JSON.parse` + Zod (`src/server/parse/json.ts`), non-coercive strict-but-shallow schemas (D12),
drop-and-count on the link pipeline. The IA-specific quirk that **a missing item returns `[]`**
rather than 404 (E3) means the metadata response schema is a union: full object OR empty array (→
treated as `load(): null`).

---

## 4. Item → movie / series / episode mapping in our data model

IA's model (E3, VERIFIED): an **item** (identifier) is a directory of files with metadata; a
**collection** groups items; there is no native "series/season/episode" object for movies.

Planned mapping (INFERRED — a design decision for D20, not an IA fact):

- **Item = one work.** A curated public-domain film item → `MovieLoadResponse` with a single
  `dataUrl`. This is the v1 scope and the only mapping with an approved rights story (§1).
- **Multi-part items (INFERRED, deferred):** some items contain several independently titled video
  files (e.g. serial episode reels). The contract supports this as `TvSeriesLoadResponse` with one
  `Episode` per playable file (`Episode.data` = the same JSON blob; `name` from the file's `title`
  if present). This mapping is **not** in the initial scope; it is recorded here so the data
  contract (opaque `Episode.data`) will not need to change if approved later.
- **Collection = not a series object.** A collection (e.g. a curated PD set) can drive a homepage
  row via scrape/advancedsearch, but we do **not** model collections as `TvSeriesLoadResponse`
  bundles — IA collections mix works, are not ordered, and have no season/episode semantics.
- **Anime/dub/live variants:** not applicable; IA provides none of these semantics for our curated
  set. `tvTypes` for this provider = `['Movie', 'Documentary']` (constant, documented).

Guard-rail: `Episode.data`/`dataUrl` stays opaque to the host (verified contract semantics);
only the provider decodes it.

---

## 5. Availability of direct MP4 / HLS playback URLs and browser-playback verification

**What is verified (E8, E7):** IA generates **web-friendly h.264 MP4 derivatives** for video items
("We will derive other file formats that are web-friendly such as h.264 mp4"), and the Archive's own
help explicitly acknowledges that some files "simply can't be streamed" and fall back to download.
So the officially documented playback path is **progressive MP4 of a derivative file** — exactly the
`PlaybackLink.type: 'video'` shape our Phase 4 player maps to native `<video>`. (Byte-range support
on the file hosts is itself NOT verified — E17, probe P2b; it is a playback prerequisite, not part
of what IA documents.)

**Direct URL form (INFERRED, E15):** `https://archive.org/download/{identifier}/{fileName}` for the
h.264 derivative selected from `files[]`, likely 30x-redirecting to a datanode
(`ia{NNN}.us.archive.org` names are VERIFIED as the item's `d1`/`d2`/`workable_servers` values, E3).

**The two playback models are different, and CORS applies differently to each:**

- **Native progressive MP4 (`PlaybackLink.type: 'video'` → `<video src>`).** A media element
  WITHOUT the `crossorigin` attribute fetches media in *no-cors* mode: cross-origin playback of a
  publicly accessible MP4 does **not** generally require CORS permission from the file host, and
  `<video>` seeking issues ordinary Range requests in that same mode. CORS permission becomes
  relevant for native playback only if the element carries `crossorigin` (needed for canvas/Web
  Audio capture of frames/audio). This is standard HTML media-element behavior, not an
  IA-specific fact — probe P2a is to verify the HTTP-level preconditions against real IA responses
  rather than assume them; P2a has **not** been run, so nothing in this document is probe-confirmed.
- **JavaScript-based playback (HLS via hls.js, DASH via dash.js/shaka, or any fetch/XHR-fed MSE
  pipeline).** The manifest and every segment are fetched from JS, so each request DOES require
  CORS permission (`Access-Control-Allow-Origin`) on the manifest and segment hosts. If IA HLS
  ever proves available, its viability would therefore depend on ACAO evidence (E16) — unlike
  native MP4 playback.

**HLS availability (E18): UNKNOWN.** No official documentation of `.m3u8` playlists for item video
was captured. The provider therefore must **not** emit `type: 'hls'` links until a probe proves
otherwise; the initial link surface is progressive MP4 only.

**Browser playback: NOT VERIFIED — and explicitly not claimable yet.** Nothing this session
proves: that a derivative file is fetchable and actually decodable (P2a/P2d), byte-range/206
seeking (P2b), the live redirect-chain shape (P2c), or that no special request headers are
required (P2e). A metadata 200 is metadata, not playback. Verification requires the §9.3 probes
plus, later, a real `<video>` test in Phase 4 on recorded fixtures first and live files second.
Until then the honest status is: **plausible (progressive MP4 via native playback), unverified.**

---

## 6. CORS, redirects, byte-range requests, subtitles, and other playback constraints

| Constraint | Finding | Tag |
|---|---|---|
| CORS on API hosts | unknown; does not matter for us — all IA calls run server-side through `HttpEngine` (D1/D18), CORS is irrelevant server-side | n/a (architecture) |
| CORS on file hosts | **diagnostic, not a gate for native playback.** A plain cross-origin `<video src>` (no `crossorigin` attribute) plays a publicly accessible progressive MP4 without requiring `Access-Control-Allow-Origin` (standard no-cors media-element behavior; probe P2a — not yet run — is to establish the HTTP-level preconditions on real IA responses). ACAO on file hosts matters only for (a) JS-fetched playback (hls.js/DASH manifest+segment requests) and (b) `crossorigin` uses (canvas/Web Audio). Probe P2f is to RECORD ACAO values as diagnostic evidence for those future options; its absence must never be read as "MP4 playback fails" | native model: standard spec behavior INFERRED until P2a runs; IA ACAO values UNKNOWN (P2f); nothing probe-confirmed |
| Native playback fetchability | whether a derivative file serves a normal 2xx media response a `<video>` element can consume (`Content-Type`, `Content-Length`, no auth wall) — tested as its own behavior | UNKNOWN — probe P2a |
| Redirects | file URLs are expected to redirect (30x, possibly 307 per E10) to datanodes — tested as its own behavior (chain shape, methods, hosts). Our engine follows redirects manually and re-validates every hop through the full SSRF pipeline (D18.5) — this must stay intact; every hop's destination must satisfy the provider's verified-destination policy (§8) — allowlist membership is re-checked per hop and never assumed from wildcard shape | redirect existence INFERRED; our handling VERIFIED-by-tests; live chain shape UNKNOWN — probe P2c |
| Byte-range seeking | `<video>` seeking requires range support on the file server (or the relay passing ranges through — Phase 4 requirement) — tested as its own behavior: `Accept-Ranges` advertisement, then a real `Range` request → 206 with the correct byte window | UNKNOWN — probe P2b |
| Codec/container sanity | a `.mp4` file NAME is not proof of a playable codec; IA warns some items cannot stream at all (E7). Probe P2d reads the first byte range and confirms an MP4/ISO-BMFF container (`ftyp`) | UNKNOWN — probe P2d |
| Request headers for playback | whether the file URL requires any special headers (referer/cookie/UA beyond a plain GET) — tested as its own behavior: plain unauthenticated GET with our identified UA must succeed | INFERRED (none expected) — probe P2e |
| Response headers for logs | engine events already carry origin+path only, never query strings or headers (D19) — keep | our guarantee |
| Subtitles | no official statement that movies ship captions; `files[]` is the only per-item source (E21 UNKNOWN). Provider emits `SubtitleFile` only when a `.srt`/`.vtt` entry actually exists in the fixture; otherwise none. No caption fabrication | UNKNOWN (per-item) |
| Mixed codecs | IA warns some items cannot stream at all (E7); `loadLinks` must treat missing/unusable derivative as "no links" (handled = true, zero emissions), never invent a URL | VERIFIED (caution) |
| Size variance | derivative ladder varies per item (INFERRED); `files[]` + size fields are the selection basis; quality sorting stays in `LinkPipeline` (unknown-quality-last is already tested) | INFERRED |
| HTML descriptions | search/detail `description` values are frequently HTML fragments → must pass through the parse toolkit's text extraction (server-side), not be injected anywhere raw | INFERRED (community-known) |

---

## 7. Rate limits, caching rules, timeouts, and error handling

**Published numbers: none (E19 — UNKNOWN).** What IS published (E5, VERIFIED) is a conduct policy:
descriptive User-Agent mandatory; add delays between bulk requests; honor `429` + `Retry-After`;
cache responses to avoid repeats; use bulk endpoints; retry with exponential backoff. E12 shows
rate-limit introspection exists only for the Tasks API — not for search/metadata. Therefore our
plan is conservative by construction, and its numbers are OURS (recorded in D20, not attributed to
IA): identified UA string (`cloudstream-web/<version> (+https://github.com/smithP2007/CLOUDSTREAM)`,
which satisfies the E5 tool+version requirement), per-provider pacing ≥ 1 request/second sustained,
low concurrency (≤ 2), instant stop-and-backoff on any 429 honoring `Retry-After`.

**Caching rules.** Official best practice is to cache (E5). Our machinery: engine response cache
(bounded LRU, honors `no-store`/`private`/`max-age`, never caches `set-cookie` responses — D18.6)
plus `LinkPipeline` TTL cache keyed `(scope, providerName, episodeId)` with the 20-minute default
mirroring the verified upstream link-cache behavior (D19). Credentialed links are never cached in
shared scope (D19) — moot for anonymous IA reads but the invariant stays. Proposed provider
defaults (ours): search responses 10 min, metadata 20 min, files-list handled inside metadata.

**Timeouts.** Host defaults from `src/core/provider.ts` apply (search 15 s, load 20 s,
loadLinks 30 s — explicitly our values, UNKNOWN upstream, already documented there). The engine's
total-deadline abort + response byte cap (D18.6) bound any IA payload; metadata for large items can
be big, so the provider reads via the parse toolkit's size caps rather than unbounded strings.

**Error handling mapping (provider-level, onto existing kinds):**

| Condition | Mapping |
|---|---|
| Missing identifier (metadata returns `[]`, E3) | `load()` returns `null` — "nothing to return", not an error |
| Metadata response carries `error` field (E3) | `ProviderFailure.kind: 'validation'` when schema-rejected; `'provider'` when the provider surfaces it |
| HTTP 429 (+ `Retry-After`) | treated as rate-limited: fail with `'provider'` + backoff at caller level; engine does not auto-retry (documented) |
| HTTP 5xx / network faults | engine `HttpFailureKind` `'networkError'`/`'dnsFailure'` → host failure kinds `'provider'`/`'timeout'` respectively by the existing host classification |
| Timeout / caller abort | `'timeout'` / `'aborted'` (host-owned, D13) |
| Robots-gated path | `'robotsDisallowed'` (D18.9) — engine stays fail-closed on robots fetch failure. Current robots.txt finding (E24, owner-provided): visible wildcard rules disallow `/control/` and `/report/`; the API paths this provider uses are not visibly disallowed — to be RE-VERIFIED for our UA group in probe P1. robots.txt is not a substitute for the ToU review (§1, R1) |
| Schema drift (IA changes shape) | Zod failure → `'validation'`, item dropped and counted (D12) — observability events make drift visible |

---

## 8. Security requirements — what must not be proxied or fetched

1. **Destination allowlist (provider config, not a code change) — verified destinations only.**
   Two layers: (i) the only intended API destination is `archive.org` itself (advancedsearch,
   scrape, metadata, services/img); (ii) a datanode destination is allowed only when it is
   **verified for the item in question** — the hostname must come from that item's own metadata
   response (`d1`, `d2`, `server`, or `workable_servers[]`, E3) at fetch time. A
   `*.us.archive.org` suffix match may remain only as a coarse shape guard (registrable-domain
   check); **matching the wildcard is never, by itself, proof that a hostname is an approved media
   server**, and no destination is followed on wildcard membership alone. Every redirect hop is
   revalidated through the full D18 SSRF pipeline (DNS pinning, per-hop destination re-validation,
   fail-closed robots gate) against this same policy: an allowlisted origin does not exempt its
   redirects, and each hop must independently satisfy (i) or (ii). The D18 guard stays exactly as
   adopted; the provider adds this **narrower** destination policy on top, never a weaker one.
2. **No credentials in v1.** Anonymous read only. Never send `Authorization: LOW`, never hold IA
   login cookies (E4 describes both — we deliberately use neither). The D19 cross-user cache rule
   is retained as defense-in-depth.
3. **Never fetched:** lending / access-restricted items (E22) — enforced at query level (curated
   collection pools) AND item level (rights register §1 + metadata gate); identifiers absent from
   the per-item rights register; anything requiring login; the S3-like write API and
   Tasks API (E10/E12 — read/write surfaces we do not use); `.torrent`/magnet files; user-supplied
   URLs of any kind (the engine still accepts no client-controlled URLs — D18.1).
4. **No media relay in Phase 3.** Native `<video>` playback of public progressive MP4 is expected
   NOT to need a relay (§5); the Phase 4 authenticated, quota-capped relay (D8) remains the
   fallback for constrained sources (headers/CORS-dependent JS playback), never an open proxy,
   and is not built now.
5. **No execution of anything extracted** (D19): descriptions, page HTML, file names are DATA. The
   parse toolkit and static packer decoder are already the only processing paths; IA needs no
   unpacker at all (its APIs are JSON) — nothing in this provider may introduce `eval`/`new
   Function`/`node:vm`.
6. **Untrusted-content hygiene:** HTML fragments inside `description` are text-extracted server-side
   before display; poster/detail URLs are validated as http(s) by existing boundary schemas before
   use; non-http(s) link targets are never resolved (parse toolkit guarantee).
7. **Kill switch:** the provider ships wired through `wrapProvider` (D19) so it can be disabled
   instantly with a typed `ProviderDisabledError` — this is the POLICY §6 commitment made concrete
   for the first real provider.

---

## 9. Automated tests and safe fixtures required before integration

**9.1 Fixtures (recorded once, committed, tests never make live calls — roadmap checklist item 3).**
Probe capture of real payloads, sanitized (nothing user-specific exists in these APIs), one file
per case under `tests/fixtures/ia/`:

1. `search-success.json` — advancedsearch output for a pinned query in a curated collection pool
   (3 rows, fields per §3).
2. `search-empty.json` — valid query, zero hits (`numFound: 0`).
3. `search-error.json` — malformed `q` (documented IA error shape; capture, don't assume).
4. `metadata-success.json` — full metadata for ONE pinned identifier with h.264 derivative files.
5. `metadata-missing.json` — the `[]` response (E3) — pins the union schema.
6. `metadata-error.json` — the `error`-field variant (E3).
7. `metadata-restricted.json` — an access-restricted/lending item's metadata (E22) — pins the
   exclusion gate (metadata only; such an item must never yield links).
8. `scrape-page.json` — one scrape page for a curated collection (homepage-row path, E2).

**9.2 Unit tests (fixture-only, deterministic).** Zod schemas for every fixture; search→
`SearchPage` mapping incl. `hasNext` derivation and the 10,000-row cap being unreachable at our
page budget; `load()` → `MovieLoadResponse` incl. year-range parsing and HTML-stripped description;
`loadLinks()` → derivative selection (h.264 preference, size sanity), quality inference,
zero-links-when-no-derivative, subtitle emission only when present; restricted-item rejection;
**rights-register enforcement (an identifier absent from the register ⇒ `load()` returns `null`
and `loadLinks()` emits nothing, even with valid-looking metadata)**;
metadata-`[]` → `null`; error/429 mapping per §7; pipeline interplay (dedupe/sort/cache) with the
existing D19 semantics; kill-switch refusal (`ProviderDisabledError`); redaction checks (no IA URL
query strings in events beyond the redacted fields).

**9.3 Live probe script (a research tool, NOT provider code — run once, output recorded into this
checklist's addendum).** Each expected playback behavior is tested SEPARATELY; a pass in one does
not imply a pass in another. `Access-Control-Allow-Origin` is recorded as diagnostic evidence
(P2f) and is never a universal pass/fail condition for native video.

- **P1 — robots.txt:** re-fetch `https://archive.org/robots.txt` and record the rules applying to
  our UA group for the paths this provider uses (`/advancedsearch.php`, `/metadata/`,
  `/download/`, `/services/`), confirming or correcting E24. robots.txt informs access posture;
  it does not replace the ToU review (P3).
- **P2a — native playback fetchability:** plain GET of one pinned derivative URL — status,
  `Content-Type`, `Content-Length`, no auth wall. (Browser-level confirmation is a Phase 4
  `<video>` test on fixtures first; P2a is to establish the HTTP-level preconditions.)
- **P2b — byte-range seeking:** `Accept-Ranges` advertisement, then a real `Range` request
  (expect 206 with the correct byte window), plus a mid-file range (seek semantics).
- **P2c — redirect chain:** record every hop of the download URL (statuses, methods, hosts); the
  final host must be a verified datanode destination under §8 — matched against the item's own
  metadata values, not the `*.us.archive.org` shape alone.
- **P2d — codec/container sanity:** the first byte range must show an MP4/ISO-BMFF container
  (`ftyp` box); a `.mp4` name alone proves nothing.
- **P2e — required-headers absence:** a plain unauthenticated GET with our identified UA must
  succeed with no referer/cookie/other special headers.
- **P2f — ACAO diagnostic:** record `Access-Control-Allow-Origin` (and `Timing-Allow-Origin` if
  present) on the file host. Diagnostic ONLY — it feeds future JS-based playback decisions (§5);
  its absence is not a native-playback failure.
- **P3 — Terms of Use snapshot:** dated copy archived into `docs/evidence/` (resolves E20/A1);
  the read-only-use clauses are then reviewed explicitly.

No probe runs before owner approval of this checklist.

---

## 10. Unresolved risks, evidence gaps, exit criteria, and recommendation

**Risks & gaps (each with mitigation or a stop condition):**

| # | Risk / gap | Severity | Mitigation | Stop condition |
|---|---|---|---|---|
| R1 | Terms of Use full text not archived (E20/A1) — roadmap requires dated archived terms; API publicness and robots non-exclusion (E24) do NOT establish permission; ambiguity ⇒ do not ship | High | P3 probe archives a dated copy; automated-access clauses then reviewed explicitly; a **favorable conclusion is a precondition for adopting D20** (§11) — adopting D20 while the gate is open is invalid | If ToU prohibits our read-only use ambiguously/unfavorably ⇒ provider does not ship (POLICY §3.4) |
| R2 | No per-item rights guarantee from IA (E6/E7) — indexed ≠ public domain; collection membership ≠ item rights | High | Two-layer gate: collection pools (search) + mandatory per-item rights register (identifier, reviewed evidence, permission scope, attribution requirements, review date, reviewer); uploader metadata treated as evidence to review, never as automatic guarantee; register enforced in `load`/`loadLinks` | Item without a register entry ⇒ not served. A register entry's rights evidence invalidated on re-review ⇒ entry removed |
| R3 | Numeric rate limits unpublished (E19) | Medium | Conservative pacing + 429/Retry-After honoring + caches (E5 discipline); observability tracks 429 events | Repeated 429s despite pacing ⇒ throttle further or suspend provider |
| R4 | Playback unverified (E16–E18): fetchability, range/seek, redirects, codecs, headers and HLS each unproven on real IA responses | Medium | Separate probes P2a–P2f gate each claim (ACAO is diagnostic, not the gate for native playback); provider emits progressive MP4 only; Phase 4 relay remains the fallback for constrained sources | Any of P2a/P2b/P2d failing on pinned files ⇒ no playback claim; keep provider read-only until Phase 4 |
| R5 | IA availability/instability (DDoS history, ongoing litigation climate — E23 CONTEXT) | Medium | Engine timeouts + caches degrade gracefully; provider failure is isolated by host error boundary (D13); kill switch | Sustained outage ⇒ provider reports failure; no code change |
| R6 | Fixture drift — IA explicitly gives "no absolute guarantee that every item will be returned, or that every item returned will remain" (E2) | Medium | Fixtures pinned to committed files (no live calls in tests); optional opt-in live smoke run separately | — |
| R7 | robots.txt posture: visible wildcard rules disallow `/control/` and `/report/` only (E24, owner-provided); rules for our UA group on the API paths still need re-verification | Low | Engine's robots gate is fail-closed already; P1 re-verifies E24 before integration | If a needed path is disallowed for our UA ⇒ do not fetch that path; renegotiate approach |
| R8 | Scope creep into lending/CDL or "borrowable" content | High | §8 item 3 hard exclusion; D20 records it | None — hard no (POLICY §3) |

**Exit criteria (extends roadmap Phase 3 exit for this provider):** (a) this checklist + probe
addendum approved, and D20 adopted — adoption being valid only after the Terms-of-Use gate is
resolved: a dated ToU copy archived (P3/A1), the read-only-use clauses explicitly reviewed, and a
favorable conclusion recorded (§11); (b) fixtures 1–8 captured and committed; (c) unit tests per
§9.2 green with zero live calls; (d) `search → load → loadLinks` works end-to-end on one curated
collection in the UI-less API layer with kill-switch wired; (e) takedown/abuse contact decision
revisited before any deployment beyond private operator use (POLICY §6).

**Recommendation: CONDITIONAL GO (direction unchanged, conditions tightened).** The Internet
Archive provider is the lowest-legal-risk option in the approved Phase 3 set (D3 explicitly names
it), the officially documented API surface covers every method of our contract, and our Phase 2
machinery (engine/guard, parse toolkit, link pipeline, observability/kill-switch) matches its
needs without new security surfaces. Proceed only after: (1) the owner approves THIS revision of
the checklist, (2) probe P3 resolves the Terms-of-Use gate (A1/R1) — a dated copy archived, the
read-only-use clauses explicitly reviewed, and a favorable conclusion recorded — and (3) only then
is D20 adopted, recording the collection pools, the per-item rights-register requirement with its
initial entries, the pacing values, and the no-HLS claim. The ordering is deliberate: **D20 cannot
be adopted while the Terms-of-Use gate is open**, so no path leads from this checklist to provider
code until the ToU review concludes favorably. Playback claims remain OFF until P2a–P2f evidence
exists. Approval of this checklist is review approval only — it does not itself authorize provider
implementation; that authorization is D20's, recorded separately by the owner, and D20 itself is
unadoptable until its ToU precondition (§11) is met.

---

## 11. Decision requested (D20 — draft for owner)

**D20 — Phase 3 authorization: Internet Archive reference provider (conditional; NOT yet adopted;
NOT adoptable while the Terms-of-Use gate is open).**

**Adoption preconditions (all required, in this order):** (i) probe P3 archives a **dated copy** of
the current Terms of Use into `docs/evidence/` (resolves E20/A1); (ii) the clauses governing
read-only automated access are **explicitly reviewed** against this provider's intended use
(search, metadata read, derivative download); (iii) that review reaches a **favorable conclusion**
— the intended use is permitted, with any conditions recorded. Until (i)–(iii) all hold, D20
remains a draft with no effect: it authorizes neither implementation nor any other phase
activity, and treating the gate as resolved by shortcut (API publicness, robots non-exclusion,
approval of this checklist) is invalid.

**What adoption would authorize (only once the preconditions hold):** implementation of the IA
provider under: content categories POLICY §3.1/§3.2 only; collection pools recorded in-repo PLUS a
mandatory per-item rights register (individually approved identifiers with reviewed rights
evidence, concluded permission scope, attribution requirements, review date, reviewer —
uploader-provided license metadata counts only as evidence to review); anonymous read-only API use
consistent with the reviewed ToU; progressive-MP4-only links until P2a–P2f evidence supports more
(ACAO diagnostic only); conservative pacing + identified User-Agent; robots posture re-verified
(P1/E24); fixtures-first testing; kill-switch mandatory; no lending/authenticated/torrent/DRM
surfaces; no media relay in Phase 3. Superseded only by a new explicit decision. Adopting D20 is
the ONLY act that authorizes implementation; checklist approval alone does not, and neither does
editing this checklist.

*This document is review output only — no implementation files were modified, no probes were run,
and no provider code exists.*
