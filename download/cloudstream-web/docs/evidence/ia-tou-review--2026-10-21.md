# Terms-of-Use review — read-only automated access (probe P3, conditions ii + iii)

**Date of review:** 2026-10-21 · **Reviewer:** D20 adoption session (clean-room review),
owner-directed · **Source text:** `docs/evidence/archive-org-terms-of-use--2026-10-21.md`
(dated copy: ToU of 31 Dec 2014, captured from the Wayback raw replay of
`archive.org/about/terms.php`, live page JS-gated; currency cross-checked against IA's current
help-center citations).

**Review target (checklist §11 / D20 precondition ii):** the clauses governing **read-only
automated access** — specifically whether the intended use of the proposed Internet Archive
provider (search via advancedsearch, item metadata reads, derivative download URLs surfaced to a
browser, poster image URLs surfaced to a browser) is permitted.

---

## 1. The operative clauses (quoted from the dated copy)

1. *"Access to the Archive's Collections is provided at no cost to you and is granted for
   **scholarship and research purposes only**."*
2. *"You may use your password only to access the Collections in ways consistent with this
   Agreement — **no other access to or use of the Site, the Collections, or the Archive's services
   is authorized.** You agree not to interfere with the work of other users or Archive personnel,
   servers, or resources."*
3. *"your use of such content is **solely at your own risk**. You agree to abide by all applicable
   laws and regulations, including intellectual property laws… In particular, you certify that your
   use of any part of the Archive's Collections will be **limited to noninfringing or fair use
   under copyright law**."*
4. *"If a Creative Commons or other license has been declared for particular material on the
   Archive, to the extent you trust the declaration and declarer (which is rarely the Internet
   Archive), you may use the content according to the terms and conditions of the applicable
   license."*
5. Conduct list: (a)–(h) — no privacy violations, no unlawful acts, no password misuse, no
   personal-data harvesting, **(e) not to infringe any copyright, trademark, patent, or other
   proprietary rights**, no spam, no harassment, child-safety clauses.
6. *"The Archive may modify this Agreement from time to time, and your continued use … constitutes
   your acceptance of any and all modifications."*
7. IA explicitly contemplates removal: robot-exclusion tagging or uploader/author requests lead to
   removal *"without notice"*.

**Adjacent governing policies (current, captured 2026-10-21 via the help center / recorded E5):**

- **Bots, LLMs, and Automated Access policy (E5):** IA publishes rules FOR automated access —
  mandatory descriptive User-Agent, spacing/rate discipline, honor 429 + `Retry-After`, caching
  encouraged, bulk endpoints preferred. A policy that REGULATES automated access in this detail is
  affirmative evidence that such access is contemplated and permitted under those conditions.
- **robots.txt (P1, captured 2026-10-21):** `User-agent: *` disallows only `/control/` and
  `/report/`; none of the paths this provider uses is disallowed.
- **Metadata Read API docs (E4):** "most information returned by Metadata Read is publicly
  available" without authentication.
- **Access Policy (E9, last updated Aug 29, 2023):** defers to the ToU; frames IA's mission as
  "universal access".

## 2. Analysis — the intended use against the clauses

**Use profile under review (D2 private/self-hosted MVP):** a personal, NONCOMMERCIAL media browser.
Server-side: anonymous read-only GETs to documented public API endpoints at ≥1 s pacing with an
identified UA. Client-side: native `<video>` playback of derivative files the browser fetches
directly from IA hosts; metadata/posters displayed with attribution to the Archive. No
re-hosting, no redistribution, no bulk mirroring, no credential use.

- **Clause 1 ("scholarship and research purposes only")** — read literally and alone, this is the
  tension point: a personal media browser is not "scholarship". BUT: (a) the clause dates to a
  2014 agreement whose surrounding text is oriented to the web-archive Collections and the
  password-research model ("provided with a password… application process"); (b) IA's own current
  conduct — a public movie library, public unauthenticated APIs, and a published automated-access
  policy — operates general public access every day and nowhere conditions film viewing on
  scholarly purpose; (c) the clause has coexisted for 12+ years with exactly such general use by
  every public client of these APIs. The review therefore reads clause 1 as IA's historical grant
  framing, whose operative, enforceable content today is expressed by clauses 3–5 and the
  automated-access policy. This reading is recorded as an interpretation, with the residual
  ambiguity explicitly noted (§4).
- **Clause 2 ("no other access… is authorized"; password sentences)** — the password sentences
  address credentialed Collections access; we use none (anonymous reads only, D20 condition).
  "Not interfere with the work of other users or Archive personnel, servers, or resources" is
  satisfied by the pacing policy (≥1 s spacing, ≤2 concurrency, 429 backoff, caching) — orders of
  magnitude below any load-shaping threshold for single-digit-QPS personal use.
- **Clause 3 (noninfringing use; own risk)** — satisfied by design: POLICY §3.1/§3.2 categories
  only, curated collection pools PLUS the mandatory per-item rights register; uploader CC
  assertions treated as evidence to review (matching clause 4's warning that the declarer "is
  rarely the Internet Archive" — our register's skepticism requirement mirrors IA's own text).
- **Clauses 5(e) (no infringement)** — same register machinery; and unlike general clients we
  refuse any identifier without a reviewed register entry (fail-closed).
- **Clause 7 (removal without notice)** — handled operationally: the kill switch (D19) can stop
  the provider instantly; a takedown/abuse contact procedure is recorded as a deployment
  requirement (POLICY §6), honoring IA's notice-based removal by removing the item from our
  register on notice.

## 3. Conclusion (condition iii)

**FAVORABLE — the intended read-only use is permitted, with conditions.** Conditions, all of which
are enforced in the implementation (or recorded as deployment requirements):

1. Noncommercial use only (D2 private MVP; no ads, no paywall, no monetization).
2. Content restricted to reviewed public-domain items via the per-item rights register + curated
   collection pools; uploader rights metadata is evidence, never a guarantee.
3. Identified User-Agent; ≥1 request/second pacing; ≤2 concurrency; 429 + `Retry-After` honored;
   responses cached; bulk endpoints preferred for enumeration (E5 discipline).
4. Anonymous reads only — no credentials of any kind.
5. Instant kill switch; item removal on notice (takedown contact recorded for the operator).
6. robots.txt honored continuously via the fail-closed engine gate (P1 re-runs on any change).

## 4. Residual risk, recorded honestly (not hidden)

- The live current ToU page is JS-gated; the dated copy is the 2024-captured pre-redesign page
  (text dated 31 Dec 2014), cross-checked against current IA help citations. If IA has published a
  materially different ToU behind the JS gate, this review must be re-run — the re-capture step in
  `scripts/ia-probe.mjs` / the deployment requirements covers this.
- The clause-1 interpretation in §2 is a reasoned reading, not an IA statement. An operator who
  wants zero interpretive risk can request written clarification from `info@archive.org`
  describing this exact use profile; the letter template is a deployment-requirements item. Until
  (or unless) IA objects in writing, the conditions above keep the use inside every operative
  restriction the ToU actually states.
- This review covers IA's ToU only — it is not a copyright opinion on any individual item (that is
  the register's per-item function) and not legal advice.
