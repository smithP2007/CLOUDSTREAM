# Phase 3 Pre-Flight Checklist — Internet Archive Provider

**Status:** DRAFT for owner review — **NOT approved**. No provider code exists or was written.
**Prepared:** 2026-10-20, after Phase 2 steps 1–5 complete (commit `6fd80cc`; baseline re-verified this
session: 267/267 vitest tests, 11 files green; `typecheck`/`lint`/`build` clean).
**Method:** desk review of official Internet Archive documentation (see §0 evidence log). This session's
sandbox has no direct egress, so live header probes (CORS, byte-range, redirects on file servers) could
not be executed — they are recorded as explicit evidence gaps (§6, §10) with a probe plan (§9.3).
**Evidence tags used throughout:** **VERIFIED** (read from an official Internet Archive source on
2026-10-20, quoted or closely paraphrased), **INFERRED** (derived from official sources + our own design
decisions; must be pinned by a recorded fixture before any provider code merges), **UNKNOWN** (not
establishable this session; blocks specific claims, not the whole review), **CONTEXT** (public-record
background, not re-verified this session).

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
| E16 | — | CORS headers on archive.org API/file hosts | UNKNOWN (no egress) |
| E17 | — | byte-range support (`Accept-Ranges: bytes`, 206 responses) on file hosts | UNKNOWN (no egress) |
| E18 | — | HLS (`.m3u8`) availability for video items | UNKNOWN (no official doc captured) |
| E19 | — | numeric rate limits for search/metadata APIs | UNKNOWN (official guidance is qualitative only) |
| E20 | — | current Terms-of-Use full text (archive.org/about/terms is JS-gated; Wayback snapshot redirected to a "lite" version) | UNKNOWN — open action A1 |
| E21 | — | subtitle/caption file availability for movies | UNKNOWN (per-item only) |
| E22 | E4 (restricted metadata classes exist) + community knowledge | lending / access-restricted items require login and must be excluded | INFERRED — pin via fixture |
| E23 | Hachette v. Internet Archive (2nd Cir. 2024), UMG v. IA settlement | IA operates under active copyright-litigation pressure | CONTEXT — re-verify if posture changes |

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
basis. It must operate on a **curated public-domain collection allowlist** plus an item-level
rights-field gate (e.g. skip items that carry an explicit restricted-rights marker or a
`licenseurl` pointing at a non-open license — the exact marker fields are INFERRED, to be pinned by
fixtures per §9). The public-domain film list IA references (E7) is itself explicitly
no-guarantee, so it may inform curation but cannot be a sole gate.

**API terms for automated access (E5, E4 — VERIFIED):** the Archive publishes a Bots/LLMs/Automated
Access policy requiring descriptive User-Agent identification and qualitative rate-limiting
discipline (§7), and documents public, unauthenticated read access to metadata ("most information
returned by Metadata Read is publicly available", E4). No clause prohibiting read-only API search or
metadata retrieval for a client application was found in the official pages captured this session;
the full current Terms of Use could not be captured (E20) and its archived dated copy is **action
A1** — an explicit gate in §10, mirroring the roadmap rule that ambiguity must be resolved (or the
provider does not ship).

**Out of scope from minute one (POLICY §3 prohibitions, D7/D8):** lending / controlled-digital-lending
items and any content requiring an archive.org account (E22), torrent/magnet delivery (excluded from
our `PlaybackLinkType` v1), and any DRM-protected item (none exists in IA public video, but the gate
is stated anyway).

**Tag summary for §1:** authorization category VERIFIED (D3/POLICY); terms permitting read-only API
use INFERRED-from-official-pending-ToU-snapshot (E20 gate); content licensing per-item
UNKNOWN-with-mitigation (curated allowlist + rights gate).

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
rights gate (not surfaced). `dataUrl` is a **provider-internal JSON blob** `{identifier, fileName}`
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
So the officially documented playback path is **progressive MP4 (byte-range HTTP) of a derivative
file** — which is exactly the `PlaybackLink.type: 'video'` shape our Phase 4 player maps to native
`<video>`.

**Direct URL form (INFERRED, E15):** `https://archive.org/download/{identifier}/{fileName}` for the
h.264 derivative selected from `files[]`, likely 30x-redirecting to a datanode
(`ia{NNN}.us.archive.org` names are VERIFIED as the item's `d1`/`d2`/`workable_servers` values, E3).

**HLS (E18): UNKNOWN.** No official documentation of `.m3u8` playlists for item video was captured.
The provider therefore must **not** emit `type: 'hls'` links until a probe proves otherwise; the
initial link surface is progressive MP4 only.

**Browser playback: NOT VERIFIED — and explicitly not claimable yet.** Nothing this session proves:
CORS on the file host (E16), byte-range/206 behavior (E17), or that a given item's derivative file
is actually fetchable and decodable. A metadata 200 is metadata, not playback. Verification requires
the §9.3 probe plus, later, a real `<video>` test in Phase 4 on recorded fixtures first and live
files second. Until then the honest status is: **plausible (progressive MP4), unverified.**

---

## 6. CORS, redirects, byte-range requests, subtitles, and other playback constraints

| Constraint | Finding | Tag |
|---|---|---|
| CORS on API hosts | unknown; does not matter for us — all IA calls run server-side through `HttpEngine` (D1/D18), CORS is irrelevant server-side | n/a (architecture) |
| CORS on file hosts | decides whether direct `src` playback works in the browser or links must flow through the Phase 4 scoped relay (D8). **Not verified** — probe P2 | UNKNOWN |
| Redirects | file URLs are expected to redirect (30x, possibly 307 per E10) to datanodes. Our engine follows redirects manually and re-validates every hop through the full SSRF pipeline (D18.5) — this must stay intact; datanode hosts must be inside the provider's destination allowlist (§8) | redirect existence INFERRED; our handling VERIFIED-by-tests |
| Byte-range | `<video>` seeking requires range support on the file server (or the relay passing ranges through — Phase 4 requirement). **Not verified** — probe P2 | UNKNOWN |
| Request headers for playback | none expected for public items (no referer/cookie documented as required for public file GETs) | INFERRED — probe |
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
| Robots-gated path | `'robotsDisallowed'` (D18.9) — note the engine's fail-closed posture on robots fetch failure; robots.txt for the API paths is itself a probe item (P1) |
| Schema drift (IA changes shape) | Zod failure → `'validation'`, item dropped and counted (D12) — observability events make drift visible |

---

## 8. Security requirements — what must not be proxied or fetched

1. **Host allowlist (provider config, not a code change):** requests restricted to `archive.org`
   and `*.us.archive.org` datanode hosts (d1/d2/workable_servers pattern, E3). The D18 SSRF guard,
   DNS pinning, per-hop redirect re-validation, and fail-closed robots gate stay exactly as adopted;
   the provider adds a **narrower** destination policy on top, never a weaker one.
2. **No credentials in v1.** Anonymous read only. Never send `Authorization: LOW`, never hold IA
   login cookies (E4 describes both — we deliberately use neither). The D19 cross-user cache rule
   is retained as defense-in-depth.
3. **Never fetched:** lending / access-restricted items (E22) — enforced at query level (curated
   collections) AND item level (metadata gate); anything requiring login; the S3-like write API and
   Tasks API (E10/E12 — read/write surfaces we do not use); `.torrent`/magnet files; user-supplied
   URLs of any kind (the engine still accepts no client-controlled URLs — D18.1).
4. **No media relay in Phase 3.** If the CORS probe (P2) shows file hosts do not allow cross-origin
   playback, the answer is Phase 4's authenticated, quota-capped relay (D8) — not an ad-hoc proxy
   now, and never an open one.
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

1. `search-success.json` — advancedsearch output for a pinned query in a curated public-domain
   collection (3 rows, fields per §3).
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
metadata-`[]` → `null`; error/429 mapping per §7; pipeline interplay (dedupe/sort/cache) with the
existing D19 semantics; kill-switch refusal (`ProviderDisabledError`); redaction checks (no IA URL
query strings in events beyond the redacted fields).

**9.3 Live probe script (a research tool, NOT provider code — run once, output recorded into this
checklist's addendum).** P1: `GET https://archive.org/robots.txt` — verify `/advancedsearch.php`,
`/metadata/`, `/download/` paths for our UA group. P2: header probe on a pinned file URL — status,
`Content-Type`, `Accept-Ranges`, a real `Range` request (expect 206), redirect chain + final host,
`Access-Control-Allow-Origin` presence. P3: fetch one h.264 byte range and confirm decodable MP4
header bytes. P4: dated Terms-of-Use snapshot archived into `docs/evidence/` (resolves E20/A1).
No probe runs before owner approval of this checklist.

---

## 10. Unresolved risks, evidence gaps, exit criteria, and recommendation

**Risks & gaps (each with mitigation or a stop condition):**

| # | Risk / gap | Severity | Mitigation | Stop condition |
|---|---|---|---|---|
| R1 | Terms of Use full text not archived (E20/A1) — roadmap requires dated archived terms; ambiguity ⇒ do not ship | High | P4 probe archives a dated copy; re-read automated-access clauses | If ToU prohibits our read-only use ambiguously/unfavorably ⇒ provider does not ship (POLICY §3.4) |
| R2 | No per-item rights guarantee from IA (E6/E7) — indexed ≠ public domain | High | Curated collection allowlist + metadata rights gate + attribution honoring; never treat presence in a PD list as proof | Any curated collection shows systemic mis-asserted rights ⇒ remove collection |
| R3 | Numeric rate limits unpublished (E19) | Medium | Conservative pacing + 429/Retry-After honoring + caches (E5 discipline); observability tracks 429 events | Repeated 429s despite pacing ⇒ throttle further or suspend provider |
| R4 | Playback unverified (E16–E18): CORS/range/HLS unknown | Medium | Probes P2/P3 gate any playback claim; provider emits progressive MP4 only; relay is the Phase 4 answer | If ranges/CORS + relay plan cannot support seeking, keep provider read-only until Phase 4 |
| R5 | IA availability/instability (DDoS history, ongoing litigation climate — E23 CONTEXT) | Medium | Engine timeouts + caches degrade gracefully; provider failure is isolated by host error boundary (D13); kill switch | Sustained outage ⇒ provider reports failure; no code change |
| R6 | Fixture drift — IA explicitly gives "no absolute guarantee that every item will be returned, or that every item returned will remain" (E2) | Medium | Fixtures pinned to committed files (no live calls in tests); optional opt-in live smoke run separately | — |
| R7 | robots.txt posture for API paths unknown (P1) | Low | Engine's robots gate is fail-closed already; probe before integration | If a needed path is disallowed for our UA ⇒ do not fetch that path; renegotiate approach |
| R8 | Scope creep into lending/CDL or "borrowable" content | High | §8 item 3 hard exclusion; D20 records it | None — hard no (POLICY §3) |

**Exit criteria (extends roadmap Phase 3 exit for this provider):** (a) this checklist + probe
addendum approved and recorded as D20; (b) fixtures 1–8 captured and committed; (c) unit tests per
§9.2 green with zero live calls; (d) `search → load → loadLinks` works end-to-end on one curated
collection in the UI-less API layer with kill-switch wired; (e) takedown/abuse contact decision
revisited before any deployment beyond private operator use (POLICY §6).

**Recommendation: CONDITIONAL GO.** The Internet Archive provider is the lowest-legal-risk option
in the approved Phase 3 set (D3 explicitly names it), the officially documented API surface covers
every method of our contract, and our Phase 2 machinery (engine/guard, parse toolkit, link
pipeline, observability/kill-switch) matches its needs without new security surfaces. Proceed only
after: (1) owner approves this checklist, (2) probe P4 resolves the Terms-of-Use archival gate
(A1/R1), (3) D20 records the collection allowlist, pacing values, and the no-HLS claim. Playback
claims remain OFF until P2/P3 evidence exists.

---

## 11. Decision requested (D20 — draft for owner)

**D20 — Phase 3 authorization: Internet Archive reference provider (conditional).**
Authorize implementation of the IA provider under: content categories POLICY §3.1/§3.2 only;
curated public-domain collection allowlist recorded in-repo; anonymous read-only API use;
progressive-MP4-only links until evidence supports more; conservative pacing + identified
User-Agent; fixtures-first testing; kill-switch mandatory; no lending/authenticated/torrent/DRM
surfaces; no media relay in Phase 3. Superseded only by a new explicit decision.

*This document is review output only — no implementation files were modified.*
