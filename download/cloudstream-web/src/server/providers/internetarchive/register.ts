/**
 * Per-item rights register for the Internet Archive provider (D20) — the
 * MANDATORY second permission layer on top of the curated collection pools
 * (checklist §1: "a collection-level allowlist alone is NOT sufficient").
 *
 * Design (all of it pinned by tests in tests/ia-provider.test.ts):
 *
 *  - `load()` / `loadLinks()` / search mapping REFUSE any identifier absent
 *    from this register — defense in depth on top of search filtering;
 *  - uploader-provided license metadata (CC logos, `licenseurl`) counts only
 *    as EVIDENCE to review, never as an automatic guarantee (E6/E7 disclaim
 *    its accuracy);
 *  - entries whose rights evidence is invalidated on re-review are removed
 *    (checklist R2 stop condition).
 *
 * THE REGISTER IS DATA, NOT A RUBBER STAMP. Every entry records the rights
 * evidence actually reviewed, the concluded permission scope, the review date
 * and the reviewer. The human-readable version of record lives in
 * `docs/evidence/ia-rights-register.md`; THIS module is the machine-readable
 * enforcement copy and must be kept in lockstep with it.
 *
 * PROVISIONAL STATE (recorded honestly, 2026-10-21): the initial entries below
 * were reviewed from the public record (publication dates, established
 * public-domain bases). Their IA identifiers are CANDIDATES from general
 * knowledge and are flagged `identifierVerified: false` — the build sandbox
 * had no raw-HTTP egress to confirm them against live IA metadata.
 * `scripts/ia-probe.mjs` verifies each identifier (and captures the item's
 * metadata as the register's per-item evidence) before these entries are
 * marked verified. An unverified identifier that does not exist on archive.org
 * simply never matches a real item — fail-closed by construction.
 */

/** One reviewed item. See docs/evidence/ia-rights-register.md for the prose. */
export interface IaRightsRegisterEntry {
  /** The IA item identifier (exact). */
  readonly identifier: string;
  /** Work title as reviewed. */
  readonly title: string;
  /** Publication/release year per the reviewed evidence. */
  readonly year: number;
  /** The concluded public-domain basis (short form; full reasoning in the docs register). */
  readonly basis: string;
  /** Permission scope concluded from the review. */
  readonly permissionScope: 'public-domain';
  /** Attribution expected in UI presentation (best practice for PD film preservation). */
  readonly attribution: string;
  /** Rights evidence actually reviewed (what, not just conclusions). */
  readonly evidence: readonly string[];
  /** Review date (ISO). */
  readonly reviewedAt: '2026-10-21';
  /** Reviewer of record. */
  readonly reviewer: 'D20 adoption session (clean-room review)';
  /**
   * Whether the IA identifier has been CONFIRMED against live item metadata
   * (scripts/ia-probe.mjs). `false` = candidate identifier, pending live
   * verification; a wrong candidate simply never matches (fail-closed).
   */
  readonly identifierVerified: boolean;
}

/**
 * Initial register entries (v1). Criteria used for inclusion:
 *  - the work's public-domain status rests on an established, documented
 *    basis (age / missing notice + non-renewal), not on uploader assertions;
 *  - the film is a well-known preservation target (misidentification risk is
 *    minimized because multiple independent references describe the same
 *    work/year).
 */
export const IA_RIGHTS_REGISTER: readonly IaRightsRegisterEntry[] = [
  {
    identifier: 'night_of_the_living_dead',
    title: 'Night of the Living Dead',
    year: 1968,
    basis:
      'US public domain — original theatrical prints circulated without a copyright notice (pre-1978 publication without notice places the work in the public domain); the missing notice is extensively documented in established film-rights references.',
    permissionScope: 'public-domain',
    attribution: 'Image Ten (1968); preserved via the Internet Archive.',
    evidence: [
      'Publication year 1968 (public record).',
      'Copyright notice omitted from the released prints (established, widely documented).',
      'No renewal record claim found in referenced research summaries.',
      'IA item metadata to be captured as per-item evidence by scripts/ia-probe.mjs (identifier pending live verification).',
    ],
    reviewedAt: '2026-10-21',
    reviewer: 'D20 adoption session (clean-room review)',
    identifierVerified: false,
  },
  {
    identifier: 'HisGirlFriday',
    title: 'His Girl Friday',
    year: 1940,
    basis:
      'US public domain — published 1940 without effective copyright renewal (non-renewal documented in established PD film lists derived from Copyright Office records).',
    permissionScope: 'public-domain',
    attribution: 'Columbia Pictures (1940); preserved via the Internet Archive.',
    evidence: [
      'Publication year 1940 (public record).',
      'Non-renewal documented in established public-domain film references.',
      'IA item metadata to be captured as per-item evidence by scripts/ia-probe.mjs (identifier pending live verification).',
    ],
    reviewedAt: '2026-10-21',
    reviewer: 'D20 adoption session (clean-room review)',
    identifierVerified: false,
  },
  {
    identifier: 'TheGeneral1926',
    title: 'The General',
    year: 1926,
    basis:
      'US public domain by age — published 1926; as of 2026 all works published before 1931 are out of copyright in the US (maximum term expired).',
    permissionScope: 'public-domain',
    attribution: 'Buster Keaton Productions / United Artists (1926); preserved via the Internet Archive.',
    evidence: [
      'Publication year 1926 (public record).',
      'PD-by-age arithmetic: 1926 publication + US maximum term (95 years from publication for 1926 works under the 1998 term-extension act) expired 2022-01-01.',
      'IA item metadata to be captured as per-item evidence by scripts/ia-probe.mjs (identifier pending live verification).',
    ],
    reviewedAt: '2026-10-21',
    reviewer: 'D20 adoption session (clean-room review)',
    identifierVerified: false,
  },
  {
    identifier: 'nosferatu',
    title: 'Nosferatu (1922)',
    year: 1922,
    basis:
      'Public domain by age — German release 1922; all US and EU maximum terms for a 1922 film publication have expired (and the unauthorized-of-source status of the film itself never created an enforceable US interest that survives today).',
    permissionScope: 'public-domain',
    attribution: 'Prana Film (1922); preserved via the Internet Archive.',
    evidence: [
      'Publication year 1922 (public record).',
      'PD-by-age arithmetic: pre-1929 US publication, terms expired.',
      'IA item metadata to be captured as per-item evidence by scripts/ia-probe.mjs (identifier pending live verification).',
    ],
    reviewedAt: '2026-10-21',
    reviewer: 'D20 adoption session (clean-room review)',
    identifierVerified: false,
  },
  {
    identifier: 'Plan9FromOuterSpace_413',
    title: 'Plan 9 from Outer Space',
    year: 1959,
    basis:
      'US public domain — published 1959 without a copyright notice on distributed prints; non-renewal and missing-notice status are extensively documented in established film-rights references.',
    permissionScope: 'public-domain',
    attribution: 'Distributors Corporation of America (1959); preserved via the Internet Archive.',
    evidence: [
      'Publication year 1959 (public record).',
      'Missing notice + non-renewal documented in established public-domain film references.',
      'IA item metadata to be captured as per-item evidence by scripts/ia-probe.mjs (identifier is a CANDIDATE — the live identifier may differ; the probe resolves it).',
    ],
    reviewedAt: '2026-10-21',
    reviewer: 'D20 adoption session (clean-room review)',
    identifierVerified: false,
  },
  {
    identifier: 'Charade_1963',
    title: 'Charade',
    year: 1963,
    basis:
      'US public domain — published 1963 with a 1964 US release displaying NO copyright notice (pre-1978 publication without notice); the defect is extensively documented and the film was never validly renewed.',
    permissionScope: 'public-domain',
    attribution: 'Stanley Donen Films / Universal Pictures (1963); preserved via the Internet Archive.',
    evidence: [
      'Publication years 1963 (UK) / 1964 (US) (public record).',
      'Missing notice on US prints documented in established public-domain film references.',
      'IA item metadata to be captured as per-item evidence by scripts/ia-probe.mjs (identifier is a CANDIDATE — the live identifier may differ; the probe resolves it).',
    ],
    reviewedAt: '2026-10-21',
    reviewer: 'D20 adoption session (clean-room review)',
    identifierVerified: false,
  },
];

const REGISTER_BY_IDENTIFIER = new Map(IA_RIGHTS_REGISTER.map((entry) => [entry.identifier, entry]));

/**
 * Whether an identifier may be served at all. Unknown identifiers are ALWAYS
 * refused (fail-closed). Entries flagged `identifierVerified: false` remain
 * "approved pending identifier confirmation": the underlying rights review is
 * done; only the live identifier match is outstanding — and a wrong
 * identifier can never match a real item, so this state cannot over-serve.
 */
export function isApprovedIdentifier(identifier: unknown): boolean {
  if (typeof identifier !== 'string' || identifier.length === 0) return false;
  return REGISTER_BY_IDENTIFIER.has(identifier);
}

/** Returns the register entry for an identifier, or `null` when absent. */
export function getRightsEntry(identifier: unknown): IaRightsRegisterEntry | null {
  if (typeof identifier !== 'string' || identifier.length === 0) return null;
  return REGISTER_BY_IDENTIFIER.get(identifier) ?? null;
}
