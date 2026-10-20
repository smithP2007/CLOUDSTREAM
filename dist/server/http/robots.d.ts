/**
 * robots.txt gate — the "robots-considerate fetch policy" from roadmap
 * Phase 2 task 2 (POLICY.md §6: "Providers honor robots-considerate fetch
 * policies").
 *
 * Semantics follow RFC 9309 as far as a server-side fetcher needs:
 *  - Rules are grouped by user-agent; the most specific group whose agent
 *    token matches the engine's user-agent wins, else the `*` group.
 *  - Within the winning group, the LONGEST matching rule decides; `allow`
 *    wins ties (Google-style).
 *  - `*` wildcards inside paths and a trailing `$` anchor are supported.
 *  - Missing rules / empty disallow → allowed.
 *  - robots.txt 2xx → parse; 4xx → treat as allow (RFC 9309 §2.3); 5xx or
 *    fetch failure → DISALLOW with a short retry TTL (fail closed — an
 *    unreachable robots.txt must not become an unchecked crawl license).
 *
 * The gate never fetches anything itself: the engine injects a `fetchText`
 * function (its own guarded fetch, with robots checking disabled for that
 * inner request).
 */
export interface RobotsRule {
    type: 'allow' | 'disallow';
    /** Raw path pattern from the file (used for longest-match ranking). */
    pattern: string;
    /** RegExp derived from the pattern. */
    matcher: RegExp;
}
export interface RobotsGroup {
    agents: string[];
    rules: RobotsRule[];
}
export interface ParsedRobots {
    groups: RobotsGroup[];
}
/** Parses robots.txt content. Never throws; an empty file parses to no groups. */
export declare function parseRobotsTxt(text: string): ParsedRobots;
/**
 * Decides a pathname against parsed rules for the given user-agent token.
 * `userAgentToken` is the first whitespace-separated token of the engine's
 * UA, lowercased (e.g. `cloudstream-web-engine/0.1` → `cloudstream-web-engine/0.1`).
 */
export declare function robotsAllows(parsed: ParsedRobots, userAgentToken: string, pathname: string): boolean;
export interface RobotsFetchResult {
    status: number;
    text: string;
}
export interface RobotsGateOptions {
    /** Injected fetcher (the engine's own guarded fetch, robots disabled). */
    fetchText: (url: URL) => Promise<RobotsFetchResult>;
    userAgent: string;
    /** Success/unreachable cache TTL (default 5 min). */
    ttlMs?: number;
    /** Retry TTL after a 5xx/failed robots fetch, which DISALLOWS (default 60 s). */
    unreachableTtlMs?: number;
    maxHosts?: number;
}
export declare class RobotsGate {
    #private;
    constructor(options: RobotsGateOptions);
    /**
     * Whether a GET/HEAD to `url` is allowed by the host's robots.txt. Fail
     * modes: fetch failure or 5xx → NOT allowed (cached briefly). Never throws
     * for expected failures.
     */
    isAllowed(url: URL): Promise<boolean>;
    clear(): void;
}
//# sourceMappingURL=robots.d.ts.map