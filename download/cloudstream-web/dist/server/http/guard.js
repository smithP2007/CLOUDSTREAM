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
/* -------------------------------------------------------------------------- */
/* Approvals                                                                   */
/* -------------------------------------------------------------------------- */
function normalizeApprovalHost(host) {
    return host.trim().toLowerCase().replace(/\.$/, '');
}
/**
 * Whether `host:port` matches an explicit operator approval. Approvals match
 * by exact hostname, wildcard suffix (`*.example.com`), or canonical IP
 * literal. When `ports` is specified on the approval, the destination port
 * (with scheme defaults 80/443) must be among them.
 */
export function isApprovedDestination(host, port, approved) {
    const normalizedHost = host.trim().toLowerCase().replace(/\.$/, '');
    for (const entry of approved) {
        const target = normalizeApprovalHost(entry.host);
        let hostMatches;
        if (target.startsWith('*.')) {
            const suffix = target.slice(2);
            hostMatches = normalizedHost === suffix || normalizedHost.endsWith('.' + suffix);
        }
        else {
            hostMatches = normalizedHost === target;
        }
        if (!hostMatches)
            continue;
        if (entry.ports === undefined || entry.ports.length === 0)
            return true;
        if (entry.ports.includes(port))
            return true;
    }
    return false;
}
/**
 * Hostname-only approval check (ignores the approval's port restriction —
 * used by the DNS layer, where ports are not yet known; port enforcement
 * happens in {@link validateDestinationUrl}).
 */
export function isApprovedHost(host, approved) {
    const normalizedHost = host.trim().toLowerCase().replace(/\.$/, '');
    return approved.some((entry) => {
        const target = normalizeApprovalHost(entry.host);
        if (target.startsWith('*.')) {
            const suffix = target.slice(2);
            return normalizedHost === suffix || normalizedHost.endsWith('.' + suffix);
        }
        return normalizedHost === target;
    });
}
/* -------------------------------------------------------------------------- */
/* URL validation                                                              */
/* -------------------------------------------------------------------------- */
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
function defaultPort(scheme) {
    return scheme === 'https:' ? 443 : 80;
}
/**
 * Parses and validates a destination URL. Pure (no network, no DNS). Throws
 * nothing for expected failures — rejections are returned as verdicts.
 */
export function validateDestinationUrl(raw, config = {}) {
    let url;
    try {
        url = raw instanceof URL ? raw : new URL(raw);
    }
    catch {
        return { allowed: false, reason: 'invalid-url', detail: 'URL failed to parse' };
    }
    if (!ALLOWED_SCHEMES.has(url.protocol)) {
        return {
            allowed: false,
            reason: 'scheme',
            detail: `scheme '${url.protocol.replace(/:$/, '')}' is not allowed (http/https only)`,
        };
    }
    // Reject embedded credentials outright: they leak via logs, caches, referrers.
    if (url.username !== '' || url.password !== '') {
        return { allowed: false, reason: 'credentials', detail: 'URL contains embedded credentials' };
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const port = url.port === '' ? defaultPort(url.protocol) : Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { allowed: false, reason: 'invalid-url', detail: `invalid port '${url.port}'` };
    }
    if (host === '') {
        return { allowed: false, reason: 'hostname', detail: 'empty hostname' };
    }
    // WHATWG keeps BRACKETS on IPv6 hostname literals — strip them so approval
    // matching and the IPv6 parser see the bare address.
    const bareHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    const approved = isApprovedDestination(bareHost, port, config.approvedDestinations ?? []);
    // IPv6 literal.
    if (bareHost.includes(':')) {
        const parsed = parseIpv6(bareHost);
        if (parsed === null) {
            return {
                allowed: false,
                reason: 'hostname',
                detail: `malformed or zone-scoped IPv6 literal '${bareHost}'`,
            };
        }
        // isPublicDestinationIp unwraps IPv4-mapped addresses to the IPv4 rules.
        const verdict = isPublicDestinationIp(parsed);
        if (!verdict.public && !approved) {
            return {
                allowed: false,
                reason: 'ip-blocked',
                detail: `IPv6 destination blocked: ${verdict.detail} (${bareHost})`,
            };
        }
        return { allowed: true, kind: 'ip-literal', url, literal: parsed };
    }
    // Hostname shape checks (before any DNS).
    const hostnameVerdict = validateHostnameShape(bareHost);
    if (hostnameVerdict !== null && !approved) {
        return { allowed: false, reason: 'hostname', detail: hostnameVerdict };
    }
    // IPv4 literal? (WHATWG already normalized hex/octal/decimal forms to
    // dotted-decimal, so encoded loopback hosts land here.)
    if (/^\d+(\.\d+)*$/.test(bareHost)) {
        const parsed = parseIpv4(bareHost);
        if (parsed === null) {
            return { allowed: false, reason: 'hostname', detail: `malformed IPv4 literal '${bareHost}'` };
        }
        const verdict = classifyIpv4(parsed);
        if (verdict !== 'public' && !approved) {
            return {
                allowed: false,
                reason: 'ip-blocked',
                detail: `IPv4 destination blocked: ${verdict} (${bareHost})`,
            };
        }
        return { allowed: true, kind: 'ip-literal', url, literal: parsed };
    }
    return { allowed: true, kind: 'hostname', url };
}
/**
 * Shape + name blocklist for domain hostnames. Returns a rejection detail or
 * `null` when the hostname may proceed to DNS resolution.
 */
function validateHostnameShape(host) {
    if (host.length === 0 || host.length > 253)
        return 'hostname length out of range';
    if (!/^[a-z0-9.-]+$/.test(host))
        return 'hostname contains invalid characters';
    const labels = host.split('.');
    if (labels.some((label) => label.length === 0))
        return 'hostname has an empty label';
    if (labels.some((label) => label.length > 63))
        return 'hostname label exceeds 63 characters';
    // Metadata / local control-plane hostnames — blocked WITHOUT any DNS call.
    const blockedNames = new Set([
        'localhost',
        'metadata',
        'instance-data',
        'metadata.google.internal',
        'metadata.goog',
    ]);
    if (blockedNames.has(host))
        return `'${host}' is a blocked local/metadata hostname`;
    const blockedSuffixes = ['.localhost', '.local', '.internal', '.home.arpa'];
    if (blockedSuffixes.some((suffix) => host.endsWith(suffix))) {
        return `'${host}' is in a blocked local/metadata domain`;
    }
    return null;
}
/* -------------------------------------------------------------------------- */
/* IP classification                                                           */
/* -------------------------------------------------------------------------- */
/** Builds a 32-bit integer from 4 octets (numbers 0–255). */
export function ipv4ToNumber(ip) {
    return ((ip[0] << 24) | (ip[1] << 16) | (ip[2] << 8) | ip[3]) >>> 0;
}
/**
 * Parses a strict dotted-quad IPv4 address. Returns `null` unless all four
 * octets are decimal 0–255 (WHATWG has already normalized exotic forms).
 */
export function parseIpv4(host) {
    const parts = host.split('.');
    if (parts.length !== 4)
        return null;
    const octets = [];
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part))
            return null;
        const value = Number(part);
        if (value > 255)
            return null;
        octets.push(value);
    }
    return [octets[0] ?? 0, octets[1] ?? 0, octets[2] ?? 0, octets[3] ?? 0];
}
/**
 * Parses an IPv6 literal (no zone IDs — they are rejected) into 8 16-bit
 * groups. Handles `::` expansion and IPv4-embedded tails (`::ffff:1.2.3.4`,
 * `64:ff9b::7f00:1`).
 */
export function parseIpv6(host) {
    if (host.includes('%'))
        return null; // zone IDs rejected outright
    let head;
    let tail = null;
    if (host.includes('::')) {
        const split = host.split('::');
        if (split.length !== 2)
            return null; // more than one '::'
        head = split[0] ?? '';
        tail = split[1] ?? '';
    }
    else {
        if ((host.match(/:/g) ?? []).length !== 7)
            return null;
        head = host;
    }
    const parseGroups = (part) => {
        if (part === '')
            return [];
        const groups = [];
        for (const token of part.split(':')) {
            if (token.includes('.')) {
                // Embedded IPv4 (last 32 bits).
                const v4 = parseIpv4(token);
                if (v4 === null)
                    return null;
                groups.push(((v4[0] ?? 0) << 8) | (v4[1] ?? 0));
                groups.push(((v4[2] ?? 0) << 8) | (v4[3] ?? 0));
            }
            else {
                if (!/^[0-9a-f]{1,4}$/.test(token))
                    return null;
                groups.push(parseInt(token, 16));
            }
        }
        return groups;
    };
    const headGroups = parseGroups(head);
    if (headGroups === null)
        return null;
    let tailGroups = [];
    if (tail !== null) {
        const parsed = parseGroups(tail);
        if (parsed === null)
            return null;
        tailGroups = parsed;
    }
    const total = headGroups.length + tailGroups.length;
    const missing = 8 - total;
    // '::' must represent at least ONE group; without '::' the address must be complete.
    if (missing < 0 || (tail !== null && missing === 0) || (tail === null && missing !== 0)) {
        return null;
    }
    const groups = [...headGroups, ...new Array(missing).fill(0), ...tailGroups];
    return groups;
}
/** Classifies a parsed IPv4 address. `'public'` = may be connected to. */
export function classifyIpv4(ip) {
    const n = ipv4ToNumber(ip);
    const inRange = (base, bits) => (n >>> (32 - bits)) === (base >>> (32 - bits));
    const inSpan = (start, end) => n >= start && n <= end;
    if (inSpan(0x00000000, 0x00ffffff))
        return 'this-network'; // 0.0.0.0/8
    if (inRange(0x0a000000, 8))
        return 'private'; // 10/8
    if (inSpan(0x64400000, 0x647fffff))
        return 'cgnat'; // 100.64/10
    if (inRange(0x7f000000, 8))
        return 'loopback'; // 127/8
    if (inRange(0xa9fe0000, 16))
        return 'link-local'; // 169.254/16 (incl. cloud metadata)
    if (inRange(0xac100000, 12))
        return 'private'; // 172.16/12
    if (inRange(0xc0000000, 24))
        return 'reserved'; // 192.0.0/24 (IETF protocol assignments)
    if (inRange(0xc0000200, 24))
        return 'test-net'; // 192.0.2/24
    if (inRange(0xc0586300, 24))
        return 'reserved'; // 192.88.99/24 (6to4 relay)
    if (inRange(0xc0a80000, 16))
        return 'private'; // 192.168/16
    if (inSpan(0xc6120000, 0xc613ffff))
        return 'benchmarking'; // 198.18/15
    if (inRange(0xc6336400, 24))
        return 'test-net'; // 198.51.100/24
    if (inRange(0xcb007100, 24))
        return 'test-net'; // 203.0.113/24
    if (inRange(0xe0000000, 4))
        return 'multicast'; // 224/4
    if (inRange(0xf0000000, 4))
        return 'reserved'; // 240/4 + broadcast
    return 'public';
}
function group(ip, index) {
    return ip[index] ?? 0;
}
/**
 * Classifies a parsed IPv6 address. `'public'` = may be connected to.
 * IPv4-mapped addresses are unwrapped: `::ffff:0:0/96` returns
 * `'ipv4-mapped'` and callers MUST classify the embedded IPv4 via
 * {@link classifyIpv4} (see {@link classifyIpv6Mapped}).
 */
export function classifyIpv6(ip) {
    const isZero = (index) => group(ip, index) === 0;
    const allZero = ip.every((g) => g === 0);
    if (allZero)
        return 'unspecified'; // ::/128
    if (isZero(0) && isZero(1) && isZero(2) && isZero(3) && isZero(4) && isZero(5) && isZero(6) && group(ip, 7) === 1)
        return 'loopback'; // ::1/128
    // ::ffff:0:0/96 = groups [0,0,0,0,0,0xffff,a,b] — five zero groups then 0xffff.
    if (isZero(0) && isZero(1) && isZero(2) && isZero(3) && isZero(4) && group(ip, 5) === 0xffff)
        return 'ipv4-mapped'; // unwrap & classify embedded IPv4
    // fc00::/7 ULA (incl. fd00:ec2::254 AWS IMDS over IPv6).
    if ((group(ip, 0) & 0xfe00) === 0xfc00)
        return 'ula';
    if ((group(ip, 0) & 0xffc0) === 0xfe80)
        return 'link-local'; // fe80::/10
    if ((group(ip, 0) & 0xff00) === 0xff00)
        return 'multicast'; // ff00::/8
    if (group(ip, 0) === 0x0100 && isZero(1) && isZero(2) && isZero(3))
        return 'discard'; // 100::/64
    if (group(ip, 0) === 0x2001 && isZero(1))
        return 'teredo'; // 2001::/32 — blocked wholesale
    if (group(ip, 0) === 0x2001 && group(ip, 1) === 0x0db8)
        return 'documentation'; // 2001:db8::/32
    if (group(ip, 0) === 0x2002)
        return '6to4'; // 2002::/16 — blocked wholesale
    if (group(ip, 0) === 0x0064 && group(ip, 1) === 0xff9b && isZero(2) && isZero(3))
        return 'nat64'; // 64:ff9b::/96
    return 'public';
}
/**
 * Extracts the embedded IPv4 of an IPv4-mapped address (`::ffff:a.b.c.d`) so
 * callers can run the IPv4 rules on it. Returns `null` when not mapped.
 */
export function ipv4FromMappedIpv6(ip) {
    if (classifyIpv6(ip) !== 'ipv4-mapped')
        return null;
    return [(group(ip, 6) >> 8) & 0xff, group(ip, 6) & 0xff, (group(ip, 7) >> 8) & 0xff, group(ip, 7) & 0xff];
}
/**
 * Full destination-IP policy: classify (unwrapping IPv4-mapped first) and
 * return `'public'` only when connectable. Tunnel mechanisms with embedded
 * IPv4 (6to4, NAT64, Teredo) are blocked wholesale (conservative, D18).
 */
export function isPublicDestinationIp(ip) {
    if (ip.length === 4) {
        const category = classifyIpv4(ip);
        return { public: category === 'public', detail: `ipv4:${category}` };
    }
    const mapped = ipv4FromMappedIpv6(ip);
    if (mapped !== null) {
        const category = classifyIpv4(mapped);
        return { public: category === 'public', detail: `ipv4-mapped:${category}` };
    }
    const category = classifyIpv6(ip);
    return { public: category === 'public', detail: `ipv6:${category}` };
}
/** Canonical display form used in approvals matching and error details. */
export function ipToString(ip) {
    if (ip.length === 4)
        return ip.join('.');
    return ip
        .map((g) => g.toString(16))
        .join(':')
        .replace(/(^|:)0(:0)+(:|$),?/, '$1::$2');
}
//# sourceMappingURL=guard.js.map