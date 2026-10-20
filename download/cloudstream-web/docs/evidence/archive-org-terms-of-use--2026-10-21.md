# Dated copy — Internet Archive Terms of Use (captured 2026-10-21)

**Purpose:** resolves probe **P3** / action **A1** / risk **R1** of
`docs/phase3-preflight-checklist.md` — the dated Terms-of-Use copy required before
D20 can be adopted.

## Capture provenance (all facts recorded honestly)

| Fact | Value |
|---|---|
| Capture date | **2026-10-21** |
| Captured by | WebFetch tool (assistant-level web fetch; the build sandbox has no raw-HTTP egress) |
| Source URL | `https://archive.org/about/terms.php` (canonical live target: `https://archive.org/about/terms`) |
| Retrieval path | Wayback Machine **raw-byte replay** (`id_` modifier), snapshot timestamp `20240115000000` (Wayback banner: capture of 00:43:15 **December 31, 2024**) |
| Live-page status on 2026-10-21 | `archive.org/about/terms` and `archive.org/about/terms.php` both serve a JavaScript gate ("Javascript is required for this site."); the terms text is NOT present in the served HTML |
| Wayback rendered replay | `web/20250601…` shows "Redirecting you to a lite version of archive.org…" (matches E20); `web/20240115…id_` serves the full pre-redesign static page |
| Document self-dates | "Terms of Use **31 Dec 2014**"; "Privacy Policy **10 March 2001**"; "Copyright Policy **10 March 2001**" |
| Currency cross-check (2026-10-21) | IA's current help pages cite ToU requirements matching this text: `help.archive.org/help/rights` ("Our Terms of Use require that users make use of the Internet Archive's Collections at their own risk and ensure that such use is non-infringing and in accordance with all applicable laws") and `help.archive.org/help/internet-archive-access-policy` (§4a: "The Internet Archive's Terms of Use governs patrons' use…"; page dated "Last updated August 29, 2023") |
| Residual risk (recorded, not hidden) | An updated ToU could exist behind the live JS gate. Mitigations: (1) the current help-center citations match the captured text; (2) the operative clauses reviewed below have been stable since at least 2012 (public citations of identical language); (3) the reviewed use is conservative and conditioned. Byte-faithful re-capture via `scripts/ia-probe.mjs` (P3 re-run) is a deployment requirement whenever raw egress exists. |

## The capture (verbatim, Wayback snapshot of the pre-redesign page, lines L171–L456)

> **Internet Archive's Terms of Use, Privacy Policy, and Copyright Policy**
>
> **Terms of Use**
> 31 Dec 2014
>
> This terms of use agreement (the "Agreement") governs your use of the collection of Web pages and
> other digital content (the "Collections") available through the Internet Archive (the "Archive").
> When accessing an archived page, you will be presented with the terms of use agreement. If you do
> not agree to these terms, please do not use the Archive's Collections or its Web site (the "Site").
>
> Access to the Archive's Collections is provided at no cost to you and is granted for scholarship
> and research purposes only. The Archive, at its sole discretion, may provide you with a password
> to access certain Collections, provided that you complete any required application process and
> provide accurate information in your application. You may use your password only to access the
> Collections in ways consistent with this Agreement — no other access to or use of the Site, the
> Collections, or the Archive's services is authorized. You agree not to interfere with the work of
> other users or Archive personnel, servers, or resources. Further, you agree not to recirculate
> your password to other people or organizations. Please report any unauthorized use of your
> password promptly to info@archive.org.
>
> You acknowledge that you have read and understood the Archive's Privacy Policy and agree that the
> Archive may collect, use, and distribute information pursuant to that policy. If you provide any
> content to the Archive, you grant the Archive a nonexclusive, royalty-free right to use that
> content.
>
> Some of the content available through the Archive may be governed by local, national, and/or
> international laws and regulations, and your use of such content is solely at your own risk. You
> agree to abide by all applicable laws and regulations, including intellectual property laws, in
> connection with your use of the Archive. In particular, you certify that your use of any part of
> the Archive's Collections will be limited to noninfringing or fair use under copyright law.
>
> If a Creative Commons or other license has been declared for particular material on the Archive,
> to the extent you trust the declaration and declarer (which is rarely the Internet Archive), you
> may use the content according to the terms and conditions of the applicable license.
>
> In using the Archive's site, Collections, and/or services, you further agree (a) not to violate
> anyone's rights of privacy, (b) not to act in any way that might give rise to civil or criminal
> liability, (c) not to use or attempt to use another person's password, (d) not to collect or store
> personal data about anyone, (e) not to infringe any copyright, trademark, patent, or other
> proprietary rights of any person, (f) not to transmit or facilitate the transmission of
> unsolicited email ("spam"), (g) not to harass, threaten, or otherwise annoy anyone, and (h) not to
> act in any way that might be harmful to minors, including, without limitation, transmitting or
> facilitating the transmission of child pornography, which is prohibited by federal law and may be
> reported to the authorities should it be discovered by the Archive.
>
> You agree that we may contact you from time to time with surveys or other questions regarding your
> opinions about and uses of the Archive, as well as with information we believe may be of interest
> to you. We encourage you to respond to these surveys because we value your input, which will
> assist us in improving the Archive. In addition, we request that, according to standard academic
> practice, if you use the Archive's Collections for any research that results in an article, a
> book, or other publication, you list the Archive as a resource in your bibliography.
>
> While we collect publicly available Internet documents, sometimes authors and publishers express a
> desire for their documents not to be included in the Collections (by tagging a file for robot
> exclusion or by contacting us or the original crawler group). If the author or publisher of some
> part of the Archive does not want his or her work in our Collections, then we may remove that
> portion of the Collections without notice.
>
> The Archive may immediately terminate this Agreement at its sole discretion at any time upon
> written notice (including via email) to you. Upon termination, you agree that the Archive may
> immediately deactivate any password it has issued to you and bar you from accessing the
> Collections or the Site.
>
> The Archive may modify this Agreement from time to time, and your continued use of the Collections
> and/or the Site constitutes your acceptance of any and all modifications. The Archive will attempt
> to notify you of substantial modifications via the email address that you have registered with
> us, if any.
>
> Because the content of the Collections comes from around the world and from many different
> sectors, the Collections may contain information that might be deemed offensive, disturbing,
> pornographic, racist, sexist, bizarre, misleading, fraudulent, or otherwise objectionable. The
> Archive does not endorse or sponsor any content in the Collections, nor does it guarantee or
> warrant that the content available in the Collections is accurate, complete, noninfringing, or
> legally accessible in your jurisdiction, and you agree that you are solely responsible for abiding
> by all laws and regulations that may be applicable to the viewing of the content. In addition, the
> Collections are provided to you on an as-is and as-available basis. You agree that your use of the
> Site and the Collections is at your sole risk. You understand and agree that the Archive makes no
> warranty or representation regarding the accuracy, currency, completeness, reliability, or
> usefulness of the content in the Collections, that the Site or the Collections will meet your
> requirements, that access to the Collections will be uninterrupted, timely, secure, or error free,
> or that defects, if any, will be corrected. We make no warranty of any kind, either express or
> implied.
>
> You agree to indemnify and hold harmless the Internet Archive and its parents, subsidiaries,
> affiliates, agents, officers, directors, and employees from and against any and all liability,
> loss, claims, damages, costs, and/or actions (including attorneys' fees) arising from your use of
> the Archive's services, the site, or the Collections. You agree that this Agreement is governed by
> California law and that any suit arising from this Agreement will be brought in San Francisco,
> California, and you further agree that on the election and reasonable notice of either party any
> litigation shall be referred to arbitration pursuant to the California Code of Civil Procedure,
> §§1280 et seq. In addition, you agree that should any provision in the Agreement be found invalid,
> unlawful, or unenforceable, that provision shall not affect the validity or enforceability of the
> remaining provisions.
>
> Under no circumstances, including, without limitation, negligence, shall the Archive or its
> parents, affiliates, officers, employees, or agents be responsible for any indirect, incidental,
> special, or consequential damages arising from or in connection with the use of or the inability
> to use the Site or the Collections, or any content contained on the Site or in the Collections,
> or resulting from unauthorized access to the Collections or your transmissions of data, including,
> without limitation, damages for loss of profits, use, data, or other intangibles, even if the
> Archive has been advised of the possibility of such damages. Some jurisdictions do not allow the
> limitation or exclusion of liability for incidental or consequential damages, so some of the above
> may not apply to you.
>
> This Agreement, the Privacy Policy, and other policies posted on the Site constitute the full and
> complete agreement between you and the Archive and are not intended to inure to third-party
> beneficiaries.
>
> We welcome your input. Please contact us with any comments or questions at info@archive.org.

*(The same capture also contains the Privacy Policy (10 March 2001) and Copyright Policy
(10 March 2001) — including the copyright-agent notice procedure at "Internet Archive Copyright
Agent, 300 Funston Ave., San Francisco, CA 94118, phone 415-561-6767, email info@archive.org" —
retained in the raw capture log; they are not the operative text for the read-only-access review
and are summarized here for completeness.)*

## robots.txt capture (probe P1, 2026-10-21)

```
Sitemap: https://archive.org/sitemap/sitemap.xml
User-agent: *
Disallow: /control/
Disallow: /report/
```

Retrieved via WebFetch from `https://archive.org/robots.txt` on 2026-10-21. Our UA group is `*`;
none of the paths this provider uses (`/advancedsearch.php`, `/services/search/v1/scrape`,
`/metadata/`, `/services/img/`) is disallowed. **Confirms E24** (previously owner-provided, now
independently captured). robots.txt posture remains fail-closed in the engine (D18.9).
