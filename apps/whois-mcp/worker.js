import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

// rdap.org is a bootstrap redirector: it resolves each query to the authoritative
// registry RDAP server. It answers 429 under load and 302 for most lookups, so a
// bare `!res.ok` check would report "not found" for a rate-limited request.
const RDAP = "https://rdap.org";
const RDAP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; whois-mcp/0.2)",
    Accept: "application/rdap+json, application/json",
};
const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 700;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

// The caller's fetch, so tests can inject a mock. Defaults to global fetch.
let fetchImpl = (url, init) => fetch(url, init);

// Test-only hook: replace the outbound fetch.
export function setFetchImpl(fn) {
    fetchImpl = fn ?? ((url, init) => fetch(url, init));
}

// Test-only hook: drop memoized RDAP responses.
export function clearCache() {
    cache.clear();
}

const cache = new Map();

function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    // refresh LRU position
    cache.delete(key);
    cache.set(key, hit);
    return hit.value;
}

function cacheSet(key, value) {
    if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { at: Date.now(), value });
}

function isIpLiteral(value) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
        const parts = value.split(".").map(Number);
        return parts.every((n) => n >= 0 && n <= 255);
    }
    return /^[0-9a-f:]+$/i.test(value) && value.includes(":");
}

function normalizeDomain(value) {
    // Strip a trailing root dot, scheme and path, then lowercase.
    let d = value.trim().toLowerCase();
    d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    d = d.split("/")[0].split("?")[0];
    d = d.replace(/\.$/, "");
    return d;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch an RDAP resource.
 * Returns { ok: true, data } on success, or { ok: false, error, status, retryAfter }.
 * Distinguishes rate limiting and transport failures from a real "no such object".
 */
async function rdapGet(path, { retry = true } = {}) {
    const url = `${RDAP}${path}`;
    const cached = cacheGet(url);
    if (cached) return cached;

    let lastError = "request failed";
    let lastStatus = 0;
    let retryAfter = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let res;
        try {
            res = await fetchImpl(url, {
                headers: RDAP_HEADERS,
                redirect: "follow",
                signal: controller.signal,
            });
        } catch (err) {
            clearTimeout(timer);
            const aborted = err?.name === "AbortError";
            lastError = aborted
                ? `RDAP request timed out after ${TIMEOUT_MS} ms`
                : `RDAP request failed: ${err?.message ?? "network error"}`;
            lastStatus = 0;
            if (attempt === 0 && retry) {
                await sleep(RETRY_DELAY_MS);
                continue;
            }
            return { ok: false, error: lastError, status: lastStatus, retryAfter };
        }
        clearTimeout(timer);

        lastStatus = res.status;
        const header = res.headers?.get?.("retry-after");
        retryAfter = header ? Number(header) || header : null;

        if (res.status === 429 || res.status === 503) {
            lastError =
                `RDAP is rate limiting right now (HTTP ${res.status})` +
                (retryAfter ? `; retry after ${retryAfter}s` : "");
            if (attempt === 0 && retry) {
                await sleep(RETRY_DELAY_MS);
                continue;
            }
            return { ok: false, error: lastError, status: res.status, retryAfter };
        }

        if (res.status === 404) {
            return {
                ok: false,
                error: "no registration data found for this object",
                status: 404,
                retryAfter: null,
                notFound: true,
            };
        }

        if (!res.ok) {
            lastError = `RDAP returned HTTP ${res.status}`;
            return { ok: false, error: lastError, status: res.status, retryAfter };
        }

        let data;
        try {
            data = await res.json();
        } catch (_err) {
            return {
                ok: false,
                error: "RDAP returned a non-JSON response",
                status: res.status,
                retryAfter,
            };
        }

        const value = { ok: true, data };
        cacheSet(url, value);
        return value;
    }

    return { ok: false, error: lastError, status: lastStatus, retryAfter };
}

function pickEvents(events) {
    const out = {};
    for (const e of events ?? []) {
        const key = String(e.eventAction || "event");
        if (!out[key]) out[key] = e.eventDate;
    }
    return out;
}

function summarizeDomain(d) {
    return {
        domain: d.ldhName?.toLowerCase() ?? null,
        handle: d.handle ?? null,
        status: d.status ?? [],
        events: pickEvents(d.events),
        nameservers: (d.nameservers ?? []).map((n) => n.ldhName?.toLowerCase()),
        registrar:
            (d.entities ?? [])
                .filter((e) => (e.roles ?? []).includes("registrar"))
                .map((e) =>
                    (e.vcardArray?.[1] ?? [])
                        .filter((v) => v[0] === "fn")
                        .map((v) => v[3])
                        .join(""),
                )[0] ?? null,
    };
}

function summarizeIp(d) {
    return {
        handle: d.handle ?? null,
        name: d.name ?? null,
        country: d.country ?? null,
        type: d.type ?? null,
        ipVersion: d.ipVersion ?? null,
        startAddress: d.startAddress ?? null,
        endAddress: d.endAddress ?? null,
        events: pickEvents(d.events),
        status: d.status ?? [],
    };
}

function failure(result, target, kind) {
    const payload = {
        error: result.error,
        target,
        kind,
        // Never let a caller read a rate limit as "this domain does not exist".
        retryable: !result.notFound,
    };
    if (result.status) payload.httpStatus = result.status;
    if (result.retryAfter) payload.retryAfter = result.retryAfter;
    return createMCPResponse([createTextContent(payload, true)]);
}

function buildServer() {
    const server = new McpServer(
        { name: "whois-mcp", title: "RDAP Whois MCP", version: "0.2.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "domain_whois",
        {
            description:
                "Look up domain registration data (registrar, creation/expiry dates, nameservers, " +
                "status) using the public RDAP service. Free, no API key required.",
            inputSchema: z.object({
                domain: z
                    .string()
                    .min(1)
                    .describe("Domain name, e.g. example.com"),
            }),
        },
        async ({ domain }) => {
            const target = normalizeDomain(domain);
            const valid =
                target.length > 0 &&
                target.length <= 253 &&
                target.includes(".") &&
                /^[a-z0-9.-]+$/.test(target) &&
                !target.includes("..");
            if (!valid) {
                return createMCPResponse([
                    createTextContent(
                        {
                            error: `"${domain}" is not a valid domain name`,
                            kind: "invalid_input",
                            retryable: false,
                        },
                        true,
                    ),
                ]);
            }
            const result = await rdapGet(`/domain/${encodeURIComponent(target)}`);
            if (!result.ok) {
                return failure(result, target, result.notFound ? "not_found" : "upstream_error");
            }
            return createMCPResponse([createTextContent(summarizeDomain(result.data), true)]);
        },
    );

    server.registerTool(
        "ip_whois",
        {
            description:
                "Look up network registration data for an IP address (owner, country, allocated " +
                "range, registration dates) using the public RDAP service. Free, no API key required.",
            inputSchema: z.object({
                ip: z
                    .string()
                    .min(1)
                    .describe("IPv4 or IPv6 address, e.g. 8.8.8.8"),
            }),
        },
        async ({ ip }) => {
            const target = ip.trim();
            if (!isIpLiteral(target)) {
                return createMCPResponse([
                    createTextContent(
                        {
                            error: `"${ip}" is not a valid IPv4 or IPv6 address`,
                            kind: "invalid_input",
                            retryable: false,
                        },
                        true,
                    ),
                ]);
            }
            const result = await rdapGet(`/ip/${encodeURIComponent(target)}`);
            if (!result.ok) {
                return failure(result, target, result.notFound ? "not_found" : "upstream_error");
            }
            return createMCPResponse([createTextContent(summarizeIp(result.data), true)]);
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "whois-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        return mcpHandler.fetch(request);
    },
};
