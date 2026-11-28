export type UserMediaUrlValidation =
    | { ok: true; url: URL }
    | { ok: false; reason: "invalid" | "protocol" | "private" };

const BLOCKED_HOSTNAMES = /^localhost$/i;

function isBlockedUserMediaHost(hostname: string): boolean {
    // Trailing dots are ignored by DNS / URL parsers ("localhost." == localhost)
    // but would miss /^localhost$/ and dotted IPv4 checks if left in place.
    const host = hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "");
    const normalized = host.toLowerCase();
    if (
        BLOCKED_HOSTNAMES.test(normalized) ||
        normalized.endsWith(".localhost")
    ) {
        return true;
    }

    if (normalized.includes(":")) return true;

    const parts = normalized.split(".").map(Number);
    return (
        parts.length === 4 &&
        parts.every(
            (part) => Number.isInteger(part) && part >= 0 && part <= 255,
        )
    );
}

/**
 * Apply the same URL policy to every user-supplied media fetch: HTTP(S) only,
 * with credentialed hosts, loopback names, and literal IP addresses refused.
 */
export function validateUserMediaUrl(value: string): UserMediaUrlValidation {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return { ok: false, reason: "invalid" };
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { ok: false, reason: "protocol" };
    }

    if (url.username || url.password || isBlockedUserMediaHost(url.hostname)) {
        return { ok: false, reason: "private" };
    }

    return { ok: true, url };
}
