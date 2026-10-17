import type { Context } from "hono";
import { hasTrustedProxyHeaders } from "./public-origin.ts";

// Origin-fetch egress spaces of the trusted edge that we can verify from
// inside the worker. Cloudflare sets CF-Connecting-IP to the actual TCP peer
// and clients cannot forge it, so when it does not fall inside one of these
// spaces the request did not traverse the edge, and any X-Original-Client-IP
// it carries is client-supplied spoofing rather than edge-injected truth.
//   - 64.252.64.0/18 — CloudFront Origin Shield (the egress the edge stack
//     documents; see infra/cloudfront/README.md).
//   - 130.176.0.0/17 — CloudFront edge egress modeled by the proxy tests.
const TRUSTED_EDGE_EGRESS_PREFIXES = ["64.252.", "130.176."] as const;

function cameThroughEdgeEgress(c: Context): boolean {
    const connectingIp = c.req.header("cf-connecting-ip");
    return (
        !!connectingIp &&
        TRUSTED_EDGE_EGRESS_PREFIXES.some((prefix) =>
            connectingIp.startsWith(prefix),
        )
    );
}

/**
 * Resolve the real visitor IP. When the worker is reached through a trusted
 * edge hop, CF-Connecting-IP can be the edge's egress IP — useless for rate
 * limiting or abuse detection — so we prefer X-Original-Client-IP instead.
 * A trusted edge sets that header only with a known X-Forwarded-Host:
 *   - AWS CloudFront in front of gen.pollinations.ai injects it via the
 *     `pln-gen-viewer-ip` viewer-request function (event.viewer.ip). Without
 *     this, Origin Shield collapses every client to a handful of 64.252.x
 *     egress IPs. The function overwrites any client-supplied value, so a
 *     spoofed X-Original-Client-IP cannot survive the CloudFront hop.
 *     See infra/cloudfront/README.md for the full stack.
 *
 * Both trust signals above are client-controllable on a direct hit (e.g.
 * *.myceli.ai), so a caller could otherwise present a trusted X-Forwarded-Host
 * together with a rotating X-Original-Client-IP and pick an arbitrary "client
 * IP" — bypassing every per-IP rate limit and poisoning abuse telemetry. We
 * therefore honor the forwarded original IP only when the connection itself
 * arrived from the edge's egress space, which CF-Connecting-IP proves and the
 * caller cannot fake. Direct hits keep CF-Connecting-IP, which is already
 * correct there.
 */
export function getRealClientIp(c: Context): string {
    if (hasTrustedProxyHeaders(c) && cameThroughEdgeEgress(c)) {
        const originalIp = c.req.header("x-original-client-ip");
        if (originalIp) return originalIp;
    }

    return c.req.header("cf-connecting-ip") || "unknown";
}

/** Lowercase, zero-padded hex encoding of a byte buffer. */
export function bytesToHex(bytes: ArrayBuffer): string {
    return Array.from(new Uint8Array(bytes))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

/** Salted SHA-256 hash of the full IP — irreversible without the salt. */
export async function hashIp(
    ip: string | undefined,
    salt: string,
): Promise<string | undefined> {
    if (!ip) return undefined;
    const data = new TextEncoder().encode(`${salt}:${ip}`);
    return bytesToHex(await crypto.subtle.digest("SHA-256", data));
}

/** Strip `::ffff:` prefix from IPv4-mapped IPv6 addresses. */
export function stripIPv4MappedPrefix(ip: string): string {
    const match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    return match ? match[1] : ip;
}

/** Expand IPv6 `::` shorthand to full 8-group form. */
function expandIPv6(ip: string): string {
    if (!ip.includes("::")) {
        return ip
            .split(":")
            .map((group) => group.padStart(4, "0"))
            .join(":");
    }
    const halves = ip.split("::");
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const middle = Array(8 - left.length - right.length).fill("0000");
    return [...left, ...middle, ...right]
        .map((group) => group.padStart(4, "0"))
        .join(":");
}

/** Truncate IP to /24 subnet (IPv4) or /48 subnet (IPv6, first 3 groups). */
export function truncateIpToSubnet(ip: string | undefined): string | undefined {
    if (!ip) return undefined;
    const normalized = stripIPv4MappedPrefix(ip);
    if (normalized.includes(".")) {
        const parts = normalized.split(".");
        if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    if (normalized.includes(":")) {
        const groups = expandIPv6(normalized).split(":");
        return `${groups[0]}:${groups[1]}:${groups[2]}::`;
    }
    return undefined;
}
