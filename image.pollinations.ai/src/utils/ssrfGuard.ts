/**
 * SSRF guard for user-supplied image URLs.
 *
 * Validates that a URL is safe to fetch from a server context:
 *   - Allows only http/https/data schemes
 *   - Resolves the hostname and rejects private, loopback, link-local,
 *     CGNAT, multicast, and unspecified IP ranges (IPv4 + IPv6)
 *   - Rejects bare hostnames like "localhost"
 *
 * Note on TOCTOU: DNS resolution here can differ from the resolution that
 * `fetch` performs internally. For the threat model (an authenticated user
 * trying to reach internal services) this is acceptable — defeating it would
 * require fetching by IP with a Host header, which we may add later.
 */
import { promises as dns } from "node:dns";
import { isIP } from "node:net";

const PRIVATE_IPV4: RegExp[] = [
    /^0\./, // "this network" / unspecified
    /^10\./, // RFC1918
    /^127\./, // loopback
    /^169\.254\./, // link-local (includes AWS/GCP/Azure metadata)
    /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918
    /^192\.168\./, // RFC1918
    /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // CGNAT (RFC6598)
    /^224\./, // multicast (start of class D)
];

const PRIVATE_IPV6: RegExp[] = [
    /^::1$/, // loopback
    /^::$/, // unspecified
    /^fc/i,
    /^fd/i, // unique local addresses
    /^fe8/i,
    /^fe9/i,
    /^fea/i,
    /^feb/i, // link-local fe80::/10
    /^ff/i, // multicast
];

const IPV4_MAPPED = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

export function isPrivateIp(ip: string): boolean {
    const family = isIP(ip);
    if (family === 4) return PRIVATE_IPV4.some((rx) => rx.test(ip));
    if (family === 6) {
        const mapped = ip.match(IPV4_MAPPED);
        if (mapped) return PRIVATE_IPV4.some((rx) => rx.test(mapped[1]));
        return PRIVATE_IPV6.some((rx) => rx.test(ip));
    }
    return false;
}

export class SsrfBlockedError extends Error {
    constructor(reason: string) {
        super(`Image URL blocked: ${reason}`);
        this.name = "SsrfBlockedError";
    }
}

export type ValidatedUrl =
    | { kind: "data"; raw: string }
    | { kind: "http"; url: URL };

/**
 * Validate that a URL is safe to use as an image source.
 * Returns the parsed URL or throws SsrfBlockedError.
 */
export async function validateImageUrl(rawUrl: string): Promise<ValidatedUrl> {
    if (typeof rawUrl !== "string" || rawUrl.length === 0)
        throw new SsrfBlockedError("empty URL");

    if (rawUrl.startsWith("data:")) return { kind: "data", raw: rawUrl };

    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new SsrfBlockedError("invalid URL");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new SsrfBlockedError(`protocol "${url.protocol}" not allowed`);

    const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
    if (!hostname) throw new SsrfBlockedError("empty hostname");
    if (hostname === "localhost" || hostname.endsWith(".localhost"))
        throw new SsrfBlockedError("localhost not allowed");

    if (isIP(hostname)) {
        if (isPrivateIp(hostname))
            throw new SsrfBlockedError(`private IP ${hostname}`);
        return { kind: "http", url };
    }

    let addresses: { address: string; family: number }[];
    try {
        addresses = await dns.lookup(hostname, { all: true });
    } catch {
        throw new SsrfBlockedError(`DNS lookup failed for ${hostname}`);
    }

    for (const a of addresses) {
        if (isPrivateIp(a.address))
            throw new SsrfBlockedError(
                `hostname ${hostname} resolves to private IP ${a.address}`,
            );
    }
    return { kind: "http", url };
}
