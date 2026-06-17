import type { Context } from "hono";
import { hasTrustedProxyHeaders } from "./public-origin.ts";

/**
 * Resolve the real visitor IP. When the worker is reached via the
 * pollinations-myceli-proxy in the old Cloudflare account, CF-Connecting-IP is the
 * proxy Worker's IP — useless for rate limiting or abuse detection. The proxy
 * forwards the original visitor IP as X-Original-Client-IP, which we prefer
 * when present.
 *
 * For direct hits (e.g. *.myceli.ai), only CF-Connecting-IP is present and
 * already correct.
 */
export function getRealClientIp(c: Context): string {
    if (hasTrustedProxyHeaders(c)) {
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
