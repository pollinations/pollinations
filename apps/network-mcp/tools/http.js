import { z } from "zod";
import { validateUserMediaUrl } from "../../../shared/user-media-url.ts";
import { readText } from "./dns.js";

// Redirect diagnostics from danhquach (#17811); reuse the existing URL policy.
export function publicUrl(value) {
    if (value.length > 2048) throw new Error("URL exceeds 2048 characters");
    const url = new URL(value);
    url.hostname = url.hostname.replace(/\.+$/, "");
    const checked = validateUserMediaUrl(url.href);
    if (
        !checked.ok ||
        url.port ||
        !url.hostname.includes(".") ||
        /\.(?:local|internal|localhost|test|invalid)$/.test(url.hostname)
    )
        throw new Error(
            "Use a public HTTP(S) hostname without credentials or a custom port",
        );
    url.hash = "";
    return url;
}

export async function probe(value, method) {
    const started = Date.now(),
        redirects = [],
        signal = AbortSignal.timeout(10000);
    let current = publicUrl(value);
    for (;;) {
        const hopStarted = Date.now();
        const response = await fetch(current, {
            method,
            redirect: "manual",
            signal,
            headers: {
                "User-Agent":
                    "Pollinations-Network/1.0 (hello@pollinations.ai)",
            },
        });
        const location = response.headers.get("location");
        if ([301, 302, 303, 307, 308].includes(response.status) && location) {
            await response.body?.cancel();
            if (redirects.length >= 5)
                throw new Error("Stopped after five redirects");
            const next = publicUrl(new URL(location, current).href);
            redirects.push({
                url: current.href,
                status: response.status,
                location: next.href,
                ms: Date.now() - hopStarted,
            });
            current = next;
            continue;
        }
        const headers = Object.fromEntries(response.headers);
        const cookies = response.headers.getSetCookie();
        if (cookies.length) headers["set-cookie"] = cookies;
        if (new TextEncoder().encode(JSON.stringify(headers)).length > 32768) {
            await response.body?.cancel();
            throw new Error("Response headers exceed 32 KiB");
        }
        const isText =
            /^(?:text\/|application\/(?:json|[^;]+\+json|xml|[^;]+\+xml|javascript))/i.test(
                response.headers.get("content-type") ?? "",
            );
        const preview =
            isText && method === "GET" ? await readText(response, 4096) : null;
        if (!preview) await response.body?.cancel();
        return {
            url: current.href,
            status: response.status,
            statusText: response.statusText,
            ms: Date.now() - started,
            redirects,
            headers,
            preview,
        };
    }
}

// Return a conservative snapshot of common response-security headers. This
// reports observed values, not whether a site is secure or vulnerable.
export function inspectSecurityHeaders(headers, isHttps) {
    const entries =
        headers instanceof Headers
            ? [...headers.entries()]
            : Object.entries(headers ?? {});
    const normalized = new Map(
        entries.map(([name, value]) => [
            name.toLowerCase(),
            Array.isArray(value) ? value.join(", ") : String(value),
        ]),
    );
    const read = (name) => normalized.get(name) ?? null;

    const hsts = read("strict-transport-security");
    const maxAge = hsts?.match(/(?:^|;)\s*max-age\s*=\s*(\d+)(?:\s*;|$)/i);
    const csp = read("content-security-policy");
    // Multiple CSP field lines may be coalesced into a comma-separated value.
    // Each policy is enforced independently; a later policy cannot loosen an earlier one.
    const policies = (csp ?? "").split(/,(?=\s*[a-z-]+\s)/i).map((policy) => {
        const map = new Map();
        for (const part of policy.split(";")) {
            const [name, ...sources] = part.trim().split(/\s+/);
            const key = name?.toLowerCase();
            if (key && !map.has(key))
                map.set(key, sources.map((source) => source.toLowerCase()));
        }
        return map;
    });
    const directives = policies[0] ?? new Map();
    const effectiveSources = (policy, names) => {
        for (const name of names) {
            if (policy.has(name)) return policy.get(name);
        }
        return [];
    };
    const scriptInlineAllowed = policies.length > 0 && policies.every((policy) =>
        effectiveSources(policy, ["script-src-elem", "script-src", "default-src"]).includes("'unsafe-inline'"),
    );
    const styleInlineAllowed = policies.length > 0 && policies.every((policy) =>
        effectiveSources(policy, ["style-src-elem", "style-src", "default-src"]).includes("'unsafe-inline'"),
    );
    const scriptEvalAllowed = policies.length > 0 && policies.every((policy) =>
        effectiveSources(policy, ["script-src", "default-src"]).includes("'unsafe-eval'"),
    );

    const enumHeader = (name, allowed) => {
        const value = read(name);
        const normalizedValue = value?.trim().toLowerCase() ?? null;
        return {
            present: value !== null,
            value: value?.trim() ?? null,
            recognized: normalizedValue !== null && allowed.includes(normalizedValue),
        };
    };
    const referrer = read("referrer-policy");
    const referrerValues = referrer
        ? referrer.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
        : [];
    const knownReferrerPolicies = new Set([
        "no-referrer",
        "no-referrer-when-downgrade",
        "same-origin",
        "origin",
        "strict-origin",
        "origin-when-cross-origin",
        "strict-origin-when-cross-origin",
        "unsafe-url",
    ]);

    return {
        strict_transport_security: {
            applicable: Boolean(isHttps),
            present: isHttps ? hsts !== null : false,
            max_age_seconds: isHttps && maxAge ? Number(maxAge[1]) : null,
            include_subdomains: Boolean(isHttps && hsts && /\bincludeSubDomains\b/i.test(hsts)),
            preload: Boolean(isHttps && hsts && /\bpreload\b/i.test(hsts)),
        },
        content_security_policy: {
            present: csp !== null,
            directives: [...directives.keys()],
            has_default_src: directives.has("default-src"),
            has_frame_ancestors: policies.some((policy) => policy.has("frame-ancestors")),
            allows_unsafe_inline: scriptInlineAllowed || styleInlineAllowed,
            allows_unsafe_eval: scriptEvalAllowed,
        },
        x_content_type_options: {
            present: read("x-content-type-options") !== null,
            nosniff: read("x-content-type-options")?.trim().toLowerCase() === "nosniff",
        },
        x_frame_options: enumHeader("x-frame-options", ["deny", "sameorigin"]),
        referrer_policy: {
            present: referrer !== null,
            values: referrerValues,
            recognized:
                referrerValues.length > 0 &&
                referrerValues.every((value) => knownReferrerPolicies.has(value)),
        },
        permissions_policy: { present: read("permissions-policy") !== null },
        cross_origin_opener_policy: enumHeader("cross-origin-opener-policy", [
            "unsafe-none",
            "same-origin-allow-popups",
            "same-origin",
        ]),
        cross_origin_resource_policy: enumHeader("cross-origin-resource-policy", [
            "same-site",
            "same-origin",
            "cross-origin",
        ]),
        cross_origin_embedder_policy: enumHeader("cross-origin-embedder-policy", [
            "unsafe-none",
            "require-corp",
            "credentialless",
        ]),
    };
}

async function securityHeaderCheck(url) {
    const result = await probe(url, "HEAD");
    return {
        url: result.url,
        status: result.status,
        ms: result.ms,
        redirects: result.redirects,
        headers: inspectSecurityHeaders(
            result.headers,
            new URL(result.url).protocol === "https:",
        ),
        note: "Presence and syntax snapshot only; not a full security audit. Headers may vary by route, cache, or request method.",
    };
}

export const httpTools = [
    [
        "http_probe",
        "Probe a public HTTP(S) hostname with GET or HEAD. Returns status, headers, redirects, elapsed time and at most 4 KiB of text (untrusted website content). No caller credentials or cookies are sent. Ten-second deadline, five redirects. Not a security audit or browser rendering test.",
        {
            url: z.string().url().max(2048),
            method: z.enum(["GET", "HEAD"]).default("GET"),
        },
        ({ url, method }) => probe(url, method),
    ],
    [
        "http_security_headers",
        "Inspect common security headers on a public HTTP(S) URL using HEAD. Reports observed policies, not a security score or full audit.",
        { url: z.string().url().max(2048) },
        ({ url }) => securityHeaderCheck(url),
    ],
];
