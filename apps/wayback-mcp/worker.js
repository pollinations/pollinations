import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const CDX_API_URL = "https://web.archive.org/cdx/search/cdx";
const MAX_PAGE_TEXT = 15000;

async function fetchUpstream(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
        throw new Error(`Wayback Machine returned HTTP ${response.status}.`);
    }
    return response;
}

const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

// ponytail: single-pass entity decode, so a page that repeats entities
// never double-decodes. Upgrade path: a real HTML parser if callers need
// richer markup handling.
function decodeXml(value) {
    return value.replace(
        /&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi,
        (entity, hex, code, name) => {
            if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
            if (code) return String.fromCodePoint(Number(code));
            return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
        },
    );
}

// ponytail: strips tags with the same regex read the arXiv server uses for
// Atom, so a page that nests tags inside script strings only loses fidelity,
// never correctness. Upgrade path: a real HTML parser if callers need one.
function extractText(html) {
    return html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
        .replace(/<\/?[a-zA-Z!][^>]*>/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

function decodeEntities(text) {
    return text
        .replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity) =>
            decodeXml(entity),
        )
        .replace(/\s+/g, " ")
        .trim();
}

const timestampSchema = z
    .string()
    .trim()
    .regex(
        /^\d{1,14}$/,
        "Use a 1-14 digit Wayback timestamp, e.g. 2020 or 20200101.",
    );

const urlSchema = z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine((value) => {
        try {
            const url = new URL(value);
            return (
                ["http:", "https:"].includes(url.protocol) &&
                !/(^|\.)archive\.org$/.test(url.hostname)
            );
        } catch {
            return false;
        }
    }, "Enter an http(s) URL that is not the Wayback Machine itself.");

const snapshotsSchema = z.object({
    url: urlSchema.describe("Page URL to look up, e.g. `https://example.com`."),
    matchType: z
        .enum(["exact", "prefix", "host", "domain"])
        .default("exact")
        .describe(
            "exact matches the URL, prefix matches URLs starting with it, " +
                "host and domain match whole sites.",
        ),
    from: timestampSchema.optional().describe("Earliest timestamp to include."),
    to: timestampSchema.optional().describe("Latest timestamp to include."),
    limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("How many snapshots to return, 1-50. Defaults to 10."),
});

const pageSchema = z.object({
    url: urlSchema.describe("Page URL to read, e.g. `https://example.com`."),
    timestamp: timestampSchema
        .optional()
        .describe(
            "Read the snapshot closest to this 1-14 digit timestamp, e.g. " +
                "2020 or 20200101. Defaults to the latest snapshot.",
        ),
});

async function queryCdx({ url, matchType, from, to, limit }) {
    const params = new URLSearchParams({
        url,
        output: "json",
        fl: "timestamp,original,statuscode,mimetype",
        limit: String(limit),
    });
    if (matchType && matchType !== "exact") {
        params.set("matchType", matchType);
    }
    if (from) {
        params.set("from", from);
    }
    if (to) {
        params.set("to", to);
    }
    const response = await fetchUpstream(`${CDX_API_URL}?${params}`);
    const body = await response.text();
    let rows;
    try {
        rows = JSON.parse(body);
    } catch {
        throw new Error(
            "Wayback Machine returned a response that is not a CDX JSON table.",
        );
    }
    const [header, ...values] = rows;
    const snapshots = values.map((row) => {
        const fields = Object.fromEntries(
            header.map((name, index) => [name, row[index]]),
        );
        return {
            timestamp: fields.timestamp,
            url: fields.original,
            status: fields.statuscode,
            type: fields.mimetype,
        };
    });
    return { url, snapshots };
}

async function fetchArchivedPage({ url, timestamp }) {
    // The availability API returns empty results for known-archived URLs, so
    // the latest snapshot at or before the timestamp comes from the CDX API:
    // limit=-1 is the last row of the ascending-by-time range.
    const { snapshots } = await queryCdx({
        url,
        matchType: "exact",
        to: timestamp,
        limit: -1,
    });
    const snapshot = snapshots.at(-1);
    if (!snapshot) {
        throw new Error(`No Wayback Machine snapshot found for ${url}.`);
    }
    const snapshotUrl = `https://web.archive.org/web/${snapshot.timestamp}id_/${snapshot.url}`;
    const page = await fetchUpstream(snapshotUrl);
    const contentType = page.headers.get("content-type") ?? "";
    const mime = contentType.split(";")[0].trim();
    if (
        !mime.startsWith("text/") &&
        !mime.includes("xml") &&
        mime !== "application/json"
    ) {
        throw new Error(
            `Snapshot is ${mime || "binary"}; only text snapshots are supported.`,
        );
    }
    const body = await page.text();
    const text =
        mime.includes("html") || mime.includes("xml")
            ? decodeEntities(extractText(body))
            : body.trim();
    const truncated = text.length > MAX_PAGE_TEXT;
    return {
        url,
        timestamp: snapshot.timestamp,
        status: snapshot.status,
        snapshotUrl,
        textLength: Math.min(text.length, MAX_PAGE_TEXT),
        truncated,
        text: truncated ? text.slice(0, MAX_PAGE_TEXT) : text,
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "wayback-mcp", title: "Wayback Machine MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "wayback_snapshots",
        {
            description:
                "List Internet Archive Wayback Machine snapshots of a page or " +
                "site with timestamps, statuses and types. URLs are sent to " +
                "the Wayback Machine without caller credentials.",
            inputSchema: snapshotsSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async (args) =>
            createMCPResponse([createTextContent(await queryCdx(args), true)]),
    );
    server.registerTool(
        "wayback_page",
        {
            description:
                "Read a page's archived text from the Wayback Machine: the " +
                "latest snapshot, or the latest one at or before a timestamp. " +
                "Returns the snapshot date, its URL and the page text with " +
                "markup stripped. URLs are sent to the Wayback Machine " +
                "without caller credentials.",
            inputSchema: pageSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async (args) =>
            createMCPResponse([
                createTextContent(await fetchArchivedPage(args), true),
            ]),
    );
    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    return (
        request.headers
            .get("authorization")
            ?.trim()
            .match(/^Bearer\s+(\S+)$/i)?.[1] ?? null
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "wayback-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) {
            return Response.json(
                {
                    error: "unauthorized",
                    message: "Send a Pollinations API key as a bearer token.",
                },
                {
                    status: 401,
                    headers: {
                        "WWW-Authenticate":
                            'Bearer realm="wayback-mcp.pollinations.ai"',
                    },
                },
            );
        }

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
