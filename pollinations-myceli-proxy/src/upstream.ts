/**
 * Resolve the Myceli upstream host for an incoming public host.
 *
 * 1. Explicit map (UPSTREAM_MAP var) wins for core and non-simple hosts.
 * 2. Generic rule: a single-label subdomain of pollinations.ai maps to the same
 *    label under myceli.ai (catgpt.pollinations.ai -> catgpt.myceli.ai).
 * 3. Otherwise undefined (caller returns 502).
 */
export function lookupUpstream(
    mapJson: string,
    host: string,
): string | undefined {
    let map: Record<string, string> = {};
    try {
        map = JSON.parse(mapJson) as Record<string, string>;
    } catch {
        // Malformed map: skip it and fall through to the generic rule.
    }

    if (map[host]) return map[host];

    const match = /^([a-z0-9-]+)\.pollinations\.ai$/.exec(host);
    if (match) return `${match[1]}.myceli.ai`;

    return undefined;
}
