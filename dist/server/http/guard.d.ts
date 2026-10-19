/**
 * Destination guard — the SSRF validation layer for the Phase 2 HTTP engine
 * (roadmap Phase 2 task 2, `src/server/http/guard.ts`).
 *
 * Every destination URL passes through {@link validateDestinationUrl} BEFORE
 * any connection, and every resolved IP address passes through
 * {@link classifyIpv4}/{@link classifyIpv6} BEFORE it may be connected to.
 * The DNS layer (`dns.ts`) re-validates every record and pins the validated
 * set so the connection cannot silently resolve differently (DNS rebinding).
 *
 * Policy (fail closed everywhere — any parse/validation failure rejects):
 *  - Schemes: `http` and `https` only.
 *  - No embedded credentials (`user:pass@host`) — they leak into logs/history.
 *  - Hostname blocklist (resolved WITHOUT any network call): `localhost`,
 *    `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`, and known
 *    metadata/control hostnames (`metadata.google.internal`, `metadata.goog`,
 *    `metadata`, `instance-data`).
 *  - IPv4 blocked ranges: 0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16
 *    (link-local AND cloud metadata), 172.16/12, 192.0.0/24, 192.0.2/24,
 *    198.18/15, 198.51.100/24, 192.88.99/24 (deprecated 6to4 relay), 192.168/16,
 *    203.0.113/24, 224/4 (multicast), 240/4 (reserved + broadcast).
 *  - IPv6 blocked: ::/128, ::1/128, fc00::/7 (ULA — incl. AWS IMDS
 *    `fd00:ec2::254`), fe80::/10, ff00::/8, 100::/64 (discard), 2001::/32
 *    (Teredo), 2001:db8::/32, 2002::/16 (6to4 — embedded-IPv4 tunnels are
 *    blocked wholesale, conservative), 64:ff9b::/96 (NAT64, same rationale).
 *    IPv4-MAPPED addresses (`::ffff:a.b.c.d`) are unwrapped and classified as
 *    IPv4, so `::ffff:127.0.0.1` is loopback-blocked.
 *  - WHATWG URL normalization is exploited defensively: `http://2130706433/`,
 *    `http://0x7f000001/`, `http://0177.0.0.1/`, `http://127.1/` all parse to
 *    `127.0.0.1` BEFORE the guard sees them, so encoded loopback forms are
 *    caught by the plain IPv4 rules.
 *  - {@link ApprovedDestination}: explicitly configured operator exceptions
 *    (e.g. the operator's own LAN media server — content category D3.3).
 *    Approvals override RANGE and HOSTNAME blocks for the approved host only;
 *    they never bypass scheme checks, credential rejection, or DNS pinning.
 *
 * Limitations are recorded in `docs/decisions.md` D18.
 */
import type { ApprovedDestination, ParsedIpv4, ParsedIpv6 } from './ip-types';
export type { ApprovedDestination, ParsedIpv4, ParsedIpv6 } from './ip-types';
export type GuardBlockReason = 'invalid-url' | 'scheme' | 'credentials' | 'hostname' | 'ip-blocked' | 'port';
export interface GuardAllowed {
    allowed: true;
    /** `ip-literal` destinations skip DNS; `hostname` ones must be resolved+pinned. */
    kind: 'ip-literal' | 'hostname';
    url: URL;
    /** Parsed literal IP for `ip-literal` destinations. */
    literal?: ParsedIpv4 | ParsedIpv6;
}
export interface GuardBlocked {
    allowed: false;
    reason: GuardBlockReason;
    detail: string;
}
export type GuardVerdict = GuardAllowed | GuardBlocked;
/**
 * Whether `host:port` matches an explicit operator approval. Approvals match
 * by exact hostname, wildcard suffix (`*.example.com`), or canonical IP
 * literal. When `ports` is specified on the approval, the destination port
 * (with scheme defaults 80/443) must be among them.
 */
export declare function isApprovedDestination(host: string, port: number, approved: readonly ApprovedDestination[]): boolean;
/**
 * Hostname-only approval check (ignores the approval's port restriction —
 * used by the DNS layer, where ports are not yet known; port enforcement
 * happens in {@link validateDestinationUrl}).
 */
export declare function isApprovedHost(host: string, approved: readonly ApprovedDestination[]): boolean;
/**
 * Parses and validates a destination URL. Pure (no network, no DNS). Throws
 * nothing for expected failures — rejections are returned as verdicts.
 */
export declare function validateDestinationUrl(raw: string | URL, config?: {
    approvedDestinations?: readonly ApprovedDestination[];
}): GuardVerdict;
/** Builds a 32-bit integer from 4 octets (numbers 0–255). */
export declare function ipv4ToNumber(ip: ParsedIpv4): number;
/**
 * Parses a strict dotted-quad IPv4 address. Returns `null` unless all four
 * octets are decimal 0–255 (WHATWG has already normalized exotic forms).
 */
export declare function parseIpv4(host: string): ParsedIpv4 | null;
/**
 * Parses an IPv6 literal (no zone IDs — they are rejected) into 8 16-bit
 * groups. Handles `::` expansion and IPv4-embedded tails (`::ffff:1.2.3.4`,
 * `64:ff9b::7f00:1`).
 */
export declare function parseIpv6(host: string): ParsedIpv6 | null;
export type Ipv4Category = 'public' | 'this-network' | 'private' | 'cgnat' | 'loopback' | 'link-local' | 'test-net' | 'benchmarking' | 'multicast' | 'reserved';
/** Classifies a parsed IPv4 address. `'public'` = may be connected to. */
export declare function classifyIpv4(ip: ParsedIpv4): Ipv4Category;
export type Ipv6Category = 'public' | 'unspecified' | 'loopback' | 'ipv4-mapped' | 'ula' | 'link-local' | 'multicast' | 'discard' | 'teredo' | '6to4' | 'nat64' | 'documentation';
/**
 * Classifies a parsed IPv6 address. `'public'` = may be connected to.
 * IPv4-mapped addresses are unwrapped: `::ffff:0:0/96` returns
 * `'ipv4-mapped'` and callers MUST classify the embedded IPv4 via
 * {@link classifyIpv4} (see {@link classifyIpv6Mapped}).
 */
export declare function classifyIpv6(ip: ParsedIpv6): Ipv6Category;
/**
 * Extracts the embedded IPv4 of an IPv4-mapped address (`::ffff:a.b.c.d`) so
 * callers can run the IPv4 rules on it. Returns `null` when not mapped.
 */
export declare function ipv4FromMappedIpv6(ip: ParsedIpv6): ParsedIpv4 | null;
/**
 * Full destination-IP policy: classify (unwrapping IPv4-mapped first) and
 * return `'public'` only when connectable. Tunnel mechanisms with embedded
 * IPv4 (6to4, NAT64, Teredo) are blocked wholesale (conservative, D18).
 */
export declare function isPublicDestinationIp(ip: ParsedIpv4 | ParsedIpv6): {
    public: boolean;
    detail: string;
};
/** Canonical display form used in approvals matching and error details. */
export declare function ipToString(ip: ParsedIpv4 | ParsedIpv6): string;
//# sourceMappingURL=guard.d.ts.map