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
import { TtlCache } from './cache';
/** Compiles one robots path pattern into a matcher. */
function compilePattern(pattern) {
    // Escape regex metacharacters except '*' and a trailing '$' anchor.
    let anchored = false;
    let body = pattern;
    if (body.endsWith('$')) {
        anchored = true;
        body = body.slice(0, -1);
    }
    const escaped = body
        .split('*')
        .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
    return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}
/** Parses robots.txt content. Never throws; an empty file parses to no groups. */
export function parseRobotsTxt(text) {
    const groups = [];
    let currentAgents = [];
    let currentRules = [];
    const flush = () => {
        if (currentAgents.length > 0 && currentRules.length > 0) {
            groups.push({ agents: currentAgents, rules: currentRules });
        }
        else if (currentAgents.length > 0 && currentRules.length === 0 && groups.length === 0) {
            // A group with agents but no rules (e.g. bare "User-agent: *") is a
            // no-op group; dropping it means "allowed" downstream.
        }
        currentAgents = [];
        currentRules = [];
    };
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, '').trim();
        if (line === '')
            continue;
        const colon = line.indexOf(':');
        if (colon < 0)
            continue;
        const field = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        if (field === 'user-agent') {
            // A new user-agent line after rules starts a new group.
            if (currentRules.length > 0)
                flush();
            const agent = value.toLowerCase();
            if (agent !== '' && !currentAgents.includes(agent))
                currentAgents.push(agent);
        }
        else if (field === 'allow' || field === 'disallow') {
            if (value === '' && field === 'disallow')
                continue; // empty disallow = no-op
            currentRules.push({ type: field, pattern: value, matcher: compilePattern(value) });
        }
        // crawl-delay / sitemap / others: parsed but unused (documented).
    }
    flush();
    return { groups };
}
/**
 * Decides a pathname against parsed rules for the given user-agent token.
 * `userAgentToken` is the first whitespace-separated token of the engine's
 * UA, lowercased (e.g. `cloudstream-web-engine/0.1` → `cloudstream-web-engine/0.1`).
 */
export function robotsAllows(parsed, userAgentToken, pathname) {
    const token = userAgentToken.trim().toLowerCase();
    // Most specific group: longest matching agent token; '*' is the fallback.
    let best = null;
    let bestSpecificity = -1;
    for (const group of parsed.groups) {
        for (const agent of group.agents) {
            const matches = agent === '*' ? true : token === agent || token.startsWith(agent);
            if (!matches)
                continue;
            const specificity = agent === '*' ? 0 : agent.length;
            if (specificity > bestSpecificity) {
                best = group;
                bestSpecificity = specificity;
            }
        }
    }
    if (best === null || best.rules.length === 0)
        return true;
    let winning = null;
    for (const rule of best.rules) {
        if (!rule.matcher.test(pathname))
            continue;
        if (winning === null ||
            rule.pattern.length > winning.pattern.length ||
            (rule.pattern.length === winning.pattern.length && rule.type === 'allow' && winning.type === 'disallow')) {
            winning = rule;
        }
    }
    return winning === null || winning.type === 'allow';
}
export class RobotsGate {
    #fetchText;
    #userAgent;
    #ttlMs;
    #unreachableTtlMs;
    #cache;
    constructor(options) {
        this.#fetchText = options.fetchText;
        this.#userAgent = options.userAgent;
        this.#ttlMs = options.ttlMs ?? 300_000;
        this.#unreachableTtlMs = options.unreachableTtlMs ?? 60_000;
        this.#cache = new TtlCache({
            maxEntries: options.maxHosts ?? 100,
        });
    }
    /**
     * Whether a GET/HEAD to `url` is allowed by the host's robots.txt. Fail
     * modes: fetch failure or 5xx → NOT allowed (cached briefly). Never throws
     * for expected failures.
     */
    async isAllowed(url) {
        const hostKey = `${url.protocol}//${url.host}`;
        const cached = this.#cache.get(hostKey);
        let entry;
        if (cached !== undefined) {
            entry = cached;
        }
        else {
            entry = await this.#fetchAndParse(url);
            this.#cache.set(hostKey, entry, entry.unreachable ? this.#unreachableTtlMs : this.#ttlMs);
        }
        if (entry.unreachable)
            return false;
        if (entry.parsed === null)
            return true; // 4xx: no restrictions
        const token = this.#userAgent.trim().toLowerCase();
        return robotsAllows(entry.parsed, token, url.pathname || '/');
    }
    async #fetchAndParse(url) {
        const robotsUrl = new URL(url);
        robotsUrl.search = '';
        robotsUrl.hash = '';
        robotsUrl.pathname = '/robots.txt';
        try {
            const result = await this.#fetchText(robotsUrl);
            if (result.status >= 200 && result.status < 300) {
                return { parsed: parseRobotsTxt(result.text), unreachable: false };
            }
            if (result.status >= 400 && result.status < 500) {
                return { parsed: null, unreachable: false }; // no restrictions
            }
            return { parsed: null, unreachable: true }; // 5xx: disallow
        }
        catch {
            return { parsed: null, unreachable: true }; // fail closed
        }
    }
    clear() {
        this.#cache.clear();
    }
}
//# sourceMappingURL=robots.js.map