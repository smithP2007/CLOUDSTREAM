# Internet Archive — per-item rights register (register of record)

**Established:** 2026-10-21 (D20 adoption session) · **Enforcement:** the machine-readable copy in
`src/server/providers/internetarchive/register.ts` MUST stay in lockstep with this document. This
file is the human-readable register of record; the code enforces it fail-closed.

**Why a register exists (checklist §1, E6/E7):** IA explicitly does not guarantee the copyright
status of items and cannot guarantee uploader-provided rights information. Membership in a
public-domain collection is NOT sufficient. Only individually reviewed identifiers may be served.
Uploader-provided license metadata (CC logos, `licenseurl`) is evidence to review — never an
automatic guarantee.

**Entry lifecycle:** candidate → reviewed (this register) → identifier-verified (via
`scripts/ia-probe.mjs` live metadata capture) → served. An entry whose rights evidence is
invalidated on re-review is REMOVED. An identifier absent from this register is refused by the
provider regardless of any other signal. Items are additionally removed on rights-holder notice
(takedown contact: deployment-requirements §5; IA copyright agent per the captured ToU:
info@archive.org, 300 Funston Ave., San Francisco, CA 94118, +1 415-561-6767).

## Register entries

| Identifier | Work | Year | PD basis | Permission scope | Attribution | Evidence reviewed | Identifier verified |
|---|---|---|---|---|---|---|---|
| `night_of_the_living_dead` | Night of the Living Dead | 1968 | Pre-1978 publication without copyright notice (documented); non-renewal | public domain — no restrictions | Image Ten (1968) | publication year (public record); missing-notice status (established references); live IA metadata pending | **NO — candidate** |
| `HisGirlFriday` | His Girl Friday | 1940 | Non-renewal of copyright (documented in established PD film references derived from Copyright Office records) | public domain — no restrictions | Columbia Pictures (1940) | publication year; non-renewal references; live IA metadata pending | **NO — candidate** |
| `TheGeneral1926` | The General | 1926 | PD by age (pre-1931 publication; US maximum term expired 2022) | public domain — no restrictions | Buster Keaton Productions / United Artists (1926) | publication year; term arithmetic; live IA metadata pending | **NO — candidate** |
| `nosferatu` | Nosferatu (1922) | 1922 | PD by age (pre-1929 US publication; EU terms expired) | public domain — no restrictions | Prana Film (1922) | publication year; term arithmetic; live IA metadata pending | **NO — candidate** |
| `Plan9FromOuterSpace_413` | Plan 9 from Outer Space | 1959 | Missing notice + non-renewal (extensively documented) | public domain — no restrictions | Distributors Corporation of America (1959) | publication year; notice/renewal references; live IA metadata pending | **NO — candidate** |
| `Charade_1963` | Charade | 1963 | US prints without copyright notice (documented); no valid renewal | public domain — no restrictions | Stanley Donen Films / Universal (1963) | publication years; notice references; live IA metadata pending | **NO — candidate** |

**All identifiers are CANDIDATES** (`identifierVerified: false`): the adoption session had no
raw-HTTP egress to confirm them against live IA metadata. This state cannot over-serve — a wrong
candidate identifier simply never matches a real item. `scripts/ia-probe.mjs` verifies each
identifier, captures the item's metadata as the per-item evidence file (`docs/evidence/ia/register-evidence/`),
and flips the flags in both this register and `register.ts` only on success.

## Review criteria applied (for future entries)

1. The PD basis must be an established, documented ground (age arithmetic, missing notice,
   non-renewal from Copyright Office-derived references, or a specific CC license) — never
   "it is on archive.org", never collection membership, never uploader logos alone.
2. Well-known works preferred: misidentification risk is lowest when multiple independent
   references describe the same work/year.
3. Each entry records: identifier, work, year, basis, permission scope, attribution, evidence
   reviewed, review date, reviewer.
4. Lending / CDL / "borrowable" items and anything requiring an IA account are HARD EXCLUDED
   (checklist §8.3) — no register entry may be created for them.
5. Re-review dates: entries are re-examined when the provider's pool queries change or when new
   rights evidence surfaces.
