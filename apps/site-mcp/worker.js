import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

// Crawlers whose policies site owners care about when shipping AI features.
const TRACKED_BOTS = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-Web",
    "Google-Extended",
    "PerplexityBot",
    "CCBot",
    "Bytespider",
    "Applebot-Extended",
];

const WELL_KNOWN_PATHS = [
    "/.well-known/agent-card.json",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-authorization-server",
    "/.well-known/security.txt",
    "/.well-known/llms.txt",
];

const DEFAULT_SITEMAP_PATH = "/sitemap.xml";
const TEXT_CAP = 262144;
const SITEMAP_CAP = 1048576;
const INDEX_CHILD_LIMIT = 5;

function requireHttpUrl(input) {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(
            `Only http and https URLs are supported, got "${url.protocol}".`,
        );
    }
    return url;
}

function originOf(input) {
    const url = requireHttpUrl(input);
    return url.origin;
}

function sitemapUrlOf(input) {
    const url = requireHttpUrl(input);
    if (url.pathname === "/") url.pathname = DEFAULT_SITEMAP_PATH;
    return url.toString();
}

// Read at most `cap` bytes so a huge robots or sitemap cannot exhaust the
// worker; `truncated` reports when parsing ran over the cap.
async function fetchText(input, cap = TEXT_CAP) {
    try {
        const response = await fetch(input);
        const status = response.status;
        const reader = response.body?.getReader();
        if (!response.ok || !reader) {
            await response.body?.cancel().catch(() => {});
            return { status, text: "", truncated: false };
        }
        const decoder = new TextDecoder();
        const chunks = [];
        let size = 0;
        let truncated = false;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            size += value.byteLength;
            if (size >= cap) {
                truncated = true;
                await reader.cancel().catch(() => {});
                break;
            }
        }
        const merged = new Uint8Array(Math.min(size, cap));
        let offset = 0;
        for (const chunk of chunks) {
            const room = merged.byteLength - offset;
            if (room <= 0) break;
            merged.set(chunk.subarray(0, room), offset);
            offset += room;
        }
        return {
            status,
            text: decoder.decode(merged),
            truncated,
        };
    } catch (error) {
        return {
            status: null,
            text: "",
            truncated: false,
            error: String(error?.message ?? error),
        };
    }
}

// Status only: for paths where the body does not matter (homepage, well-known
// probes, default sitemap presence).
async function probe(input) {
    try {
        const response = await fetch(input);
        await response.body?.cancel().catch(() => {});
        return { status: response.status };
    } catch (error) {
        return { status: null, error: String(error?.message ?? error) };
    }
}

function parseRobots(text) {
    const groups = [];
    const sitemaps = [];
    let group = null;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, "").trim();
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        const field = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        if (field === "sitemap") {
            if (value) sitemaps.push(value);
            continue;
        }
        if (field === "user-agent") {
            // Consecutive user-agent lines share one group; a rule closes it.
            if (!group || group.rules.length > 0) {
                group = { agents: [], rules: [] };
                groups.push(group);
            }
            if (value) group.agents.push(value.toLowerCase());
            continue;
        }
        if ((field === "allow" || field === "disallow") && group) {
            group.rules.push({ allow: field === "allow", path: value });
        }
    }
    return { groups, sitemaps };
}

// RFC 9309 matching: a group matches when its product token is a substring of
// the crawler name; a specific match beats the wildcard group.
function matchBot(bot, groups) {
    const needle = bot.toLowerCase();
    const specific = groups.filter((entry) =>
        entry.agents.some((agent) => agent !== "*" && needle.includes(agent)),
    );
    if (specific.length > 0) {
        return { source: "group", rules: specific.flatMap((g) => g.rules) };
    }
    const wildcard = groups.filter((entry) => entry.agents.includes("*"));
    if (wildcard.length > 0) {
        return { source: "wildcard", rules: wildcard.flatMap((g) => g.rules) };
    }
    return { source: "none", rules: [] };
}

function ruleMatches(pattern, path) {
    let source = pattern;
    let exact = false;
    if (source.endsWith("$")) {
        exact = true;
        source = source.slice(0, -1);
    }
    const body = source
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
    return new RegExp(`^${body}${exact ? "$" : ""}`).test(path);
}

// Longest matching rule wins; at equal length Allow wins (RFC 9309). An empty
// Disallow matches nothing (it allows everything).
function blockedForPath(rules, path) {
    let winner = null;
    for (const rule of rules) {
        if (!rule.path || !ruleMatches(rule.path, path)) continue;
        if (
            !winner ||
            rule.path.length > winner.path.length ||
            (rule.path.length === winner.path.length && rule.allow)
        ) {
            winner = rule;
        }
    }
    return winner ? !winner.allow : false;
}

function parseLlms(text) {
    const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? null;
    let links = 0;
    for (const line of text.split(/\r?\n/)) {
        if (/^\s*(?:-\s*)?\[[^\]]+\]\(/.test(line)) links++;
    }
    return { title, links };
}

async function inspectSite(input) {
    const origin = originOf(input);
    const [homepage, robots, llms, defaultSitemap, ...wellKnown] =
        await Promise.all([
            probe(`${origin}/`),
            fetchText(`${origin}/robots.txt`),
            fetchText(`${origin}/llms.txt`),
            probe(`${origin}${DEFAULT_SITEMAP_PATH}`),
            ...WELL_KNOWN_PATHS.map((path) => probe(origin + path)),
        ]);

    const parsed = robots.status === 200 ? parseRobots(robots.text) : null;
    return {
        origin,
        homepage,
        robots: parsed
            ? {
                  status: robots.status,
                  truncated: robots.truncated,
                  sitemaps: parsed.sitemaps,
                  bots: Object.fromEntries(
                      TRACKED_BOTS.map((bot) => {
                          const match = matchBot(bot, parsed.groups);
                          return [
                              bot,
                              {
                                  source: match.source,
                                  blocked: blockedForPath(match.rules, "/"),
                                  rules: match.rules.map(
                                      (rule) =>
                                          `${rule.allow ? "Allow" : "Disallow"}: ${rule.path}`,
                                  ),
                              },
                          ];
                      }),
                  ),
              }
            : {
                  status: robots.status,
                  ...(robots.error ? { error: robots.error } : {}),
              },
        llms:
            llms.status === 200
                ? {
                      status: 200,
                      truncated: llms.truncated,
                      ...parseLlms(llms.text),
                  }
                : {
                      status: llms.status,
                      ...(llms.error ? { error: llms.error } : {}),
                  },
        defaultSitemap,
        wellKnown: WELL_KNOWN_PATHS.map((path, index) => ({
            path,
            ...wellKnown[index],
        })),
    };
}

function parseUrlset(text, limit) {
    const urlCount = (text.match(/<url>/g) ?? []).length;
    const entries = [];
    if (limit > 0) {
        for (const block of text.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
            if (entries.length >= limit) break;
            const loc = /<loc>([^<]*)<\/loc>/.exec(block[1])?.[1]?.trim();
            if (!loc) continue;
            const lastmod = /<lastmod>([^<]*)<\/lastmod>/
                .exec(block[1])?.[1]
                ?.trim();
            entries.push(lastmod ? { loc, lastmod } : { loc });
        }
    }
    return { urlCount, entries };
}

async function inspectSitemap(input, limit) {
    const url = sitemapUrlOf(input);
    const root = await fetchText(url, SITEMAP_CAP);
    if (root.status !== 200) {
        return {
            url,
            status: root.status,
            ...(root.error ? { error: root.error } : {}),
        };
    }

    if (root.text.includes("<urlset")) {
        return {
            url,
            status: 200,
            type: "urlset",
            ...parseUrlset(root.text, limit),
        };
    }
    if (!root.text.includes("<sitemapindex")) {
        return { url, status: 200, type: "unknown" };
    }

    const children = [...root.text.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((match) => match[1].trim())
        .slice(0, INDEX_CHILD_LIMIT);
    const results = await Promise.all(
        children.map((child) => fetchText(child, SITEMAP_CAP)),
    );
    const sitemaps = children.map((child, index) => ({
        loc: child,
        status: results[index].status,
    }));
    const entries = [];
    let urlCount = 0;
    for (const result of results) {
        if (result.status !== 200) continue;
        const parsed = parseUrlset(result.text, limit - entries.length);
        urlCount += parsed.urlCount;
        entries.push(...parsed.entries);
    }
    return {
        url,
        status: 200,
        type: "sitemapindex",
        sitemaps,
        urlCount,
        entries,
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "site-mcp", title: "Site MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "inspect_site",
        {
            description:
                "Inspect a site's crawler and agent discoverability: robots.txt rules per AI crawler (GPTBot, ClaudeBot, and friends), llms.txt, the default sitemap, and well-known documents (agent card, OAuth metadata, security.txt). Only the URL origin is used.",
            inputSchema: z.object({
                url: z
                    .string()
                    .describe("Site URL such as https://example.com."),
            }),
        },
        async ({ url }) =>
            createMCPResponse([
                createTextContent(await inspectSite(url), true),
            ]),
    );
    server.registerTool(
        "inspect_sitemap",
        {
            description:
                "Fetch a sitemap URL (a bare site URL resolves to /sitemap.xml), following sitemap indexes to up to 5 child sitemaps. Returns the entry count plus the first entries with their lastmod dates.",
            inputSchema: z.object({
                url: z.string().describe("Sitemap or site URL."),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(100)
                    .optional()
                    .describe("Entries to return (default 20)."),
            }),
        },
        async ({ url, limit }) =>
            createMCPResponse([
                createTextContent(await inspectSitemap(url, limit ?? 20), true),
            ]),
    );
    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="site-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "site-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
