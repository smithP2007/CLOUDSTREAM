/**
 * Shared IP representation types for the destination guard.
 *
 * `ParsedIpv4` is 4 octets (0–255); `ParsedIpv6` is 8 groups of 16-bit
 * integers. Arrays are used (instead of strings) so classification works on
 * the binary form — immune to encoding tricks (hex/octal IPv4, mapped IPv6,
 * zero compression).
 */

export type ParsedIpv4 = [number, number, number, number];
export type ParsedIpv6 = [
  number, number, number, number, number, number, number, number,
];

/**
 * An explicit operator-approved destination. Approvals are the ONLY way a
 * private/loopback/link-local destination may be reached (e.g. the operator's
 * own LAN media server — content category D3.3 in POLICY.md). They never
 * bypass scheme checks, credential rejection, or DNS pinning.
 */
export interface ApprovedDestination {
  /**
   * Exact hostname (case-insensitive), wildcard suffix (`*.example.com`), or
   * IP literal. Localhost/loopback entries must be listed explicitly for the
   * test/self-hosted cases.
   */
  host: string;
  /** Optional port restriction. Absent = any port on the approved host. */
  ports?: readonly number[];
}
