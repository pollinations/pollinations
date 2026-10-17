import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const REPO = "pollinations/collective-memory";
const BRANCH = "main";
const TREE_URL = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const WEB_BASE_URL = "https://memory.pollinations.ai";
const USER_AGENT =
    "pollinations-collective-memory-mcp/0.1.0 (+https://gen.pollinations.ai/mcp/collective-memory)";
const OUTPUT_LIMIT = 100_000;
const BINARY_EXT_RE = /\.(?:png|jpe?g|gif|webp|mp3|mp4|wav|ogg|pdf|zip|glb)$/i;

const cut = (text) =>
    text.length > OUTPUT_LIMIT
        ? `${text.slice(0, OUTPUT_LIMIT)}\n[cut at ${OUTPUT_LIMIT} characters]`
        : text;

function jsonResult(value, isError = false) {
    return {
        ...(isError && { isError }),
        content: [
            {
                type: "text",
                text: cut(JSON.stringify(value, null, 2)),
            },
        ],
    };
}

function normalizeRepoPath(rawPath) {
    const trimmed = rawPath.trim().replace(/^\/+/, "");
    if (!trimmed) {
        throw new Error("Invalid path: provide a non-empty repository path.");
    }
    const segments = trimmed.split("/");
    for (const seg of segments) {
        if (
            !seg ||
            seg === "." ||
            seg === ".." ||
            /[\0\\?#]/.test(seg) ||
            seg.includes("://")
        ) {
            throw new Error(
                `Invalid path "${rawPath}": use a clean relative path such as "README.md" or "collabs/README.md".`,
            );
        }
    }
    return segments.join("/");
}

function encodeRepoPath(cleanPath) {
    return cleanPath
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
}

function entryUrls(path) {
    const encoded = encodeRepoPath(path);
    return {
        rawUrl: `${RAW_BASE_URL}/${encoded}`,
        webUrl: `${WEB_BASE_URL}/${encoded}`,
    };
}

async function fetchTree() {
    const response = await fetch(TREE_URL, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": USER_AGENT,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        throw new Error(
            `Collective memory tree lookup returned HTTP ${response.status}.`,
        );
    }
    const data = await response.json();
    const blobs = (Array.isArray(data.tree) ? data.tree : []).filter(
        (item) => item.type === "blob" && typeof item.path === "string",
    );
    return blobs;
}

async function fetchRawEntry(cleanPath) {
    const { rawUrl, webUrl } = entryUrls(cleanPath);
    if (BINARY_EXT_RE.test(cleanPath)) {
        return {
            path: cleanPath,
            binary: true,
            rawUrl,
            webUrl,
            message:
                "Binary asset in collective-memory; fetch rawUrl directly to inspect.",
        };
    }
    const response = await fetch(rawUrl, {
        headers: {
            Accept: "text/plain; charset=utf-8",
            "User-Agent": USER_AGENT,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) {
        throw new Error(
            `Entry "${cleanPath}" was not found in ${REPO}@${BRANCH}.`,
        );
    }
    if (!response.ok) {
        throw new Error(
            `Collective memory entry fetch returned HTTP ${response.status}.`,
        );
    }
    const content = cut(await response.text());
    return {
        path: cleanPath,
        rawUrl,
        webUrl,
        content,
    };
}

function extractMatchingSnippets(text, terms, maxSnippets = 4) {
    const lines = text.split(/\r?\n/);
    const snippets = [];
    for (let i = 0; i < lines.length; i++) {
        const lower = lines[i].toLowerCase();
        if (terms.some((t) => lower.includes(t))) {
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length, i + 2);
            snippets.push({
                line: i + 1,
                excerpt: lines.slice(start, end).join("\n").slice(0, 400),
            });
            if (snippets.length >= maxSnippets) break;
        }
    }
    return snippets;
}

function buildServer() {
    const server = new McpServer(
        {
            name: "pollinations-collective-memory-mcp",
            version: "0.1.0",
        },
        {
            instructions:
                "Browse, search, and read shared notes from the Pollinations agent collective-memory repository (https://memory.pollinations.ai) without needing a bash shell or git checkout. Use list_memory_entries to explore spaces (collabs, games, knowledge, lore, maths, meta, pollinations, social), search_memory to find relevant notes and snippets, and read_memory_entry to read full markdown files.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "list_memory_entries",
        {
            title: "List Collective Memory Entries",
            description:
                "List files in the shared Pollinations collective-memory repository, optionally filtered by space/prefix (e.g. 'collabs', 'knowledge', 'pollinations', 'social/posts') or path substring.",
            inputSchema: z.object({
                space: z
                    .string()
                    .trim()
                    .min(1)
                    .optional()
                    .describe(
                        "Optional directory prefix such as 'collabs', 'knowledge', 'pollinations', 'social', or 'games/bottles'.",
                    ),
                query: z
                    .string()
                    .trim()
                    .min(1)
                    .optional()
                    .describe(
                        "Optional case-insensitive substring to filter file paths.",
                    ),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(200)
                    .default(50)
                    .describe("Maximum number of entries to return (1-200)."),
            }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ space, query, limit }) => {
            try {
                const blobs = await fetchTree();
                const spaces = Array.from(
                    new Set(
                        blobs
                            .filter((b) => b.path.includes("/"))
                            .map((b) => b.path.split("/")[0]),
                    ),
                ).sort();

                const cleanSpace = space
                    ? normalizeRepoPath(space).replace(/\/+$/, "")
                    : undefined;
                const qLower = query?.toLowerCase();

                const matched = blobs.filter((b) => {
                    if (
                        cleanSpace &&
                        b.path !== cleanSpace &&
                        !b.path.startsWith(`${cleanSpace}/`)
                    ) {
                        return false;
                    }
                    if (qLower && !b.path.toLowerCase().includes(qLower)) {
                        return false;
                    }
                    return true;
                });

                const slice = matched.slice(0, limit).map((b) => ({
                    path: b.path,
                    size: b.size ?? 0,
                    ...entryUrls(b.path),
                }));

                return jsonResult({
                    repo: REPO,
                    branch: BRANCH,
                    spaces,
                    totalEntries: blobs.length,
                    matchedCount: matched.length,
                    truncated: matched.length > limit,
                    entries: slice,
                });
            } catch (error) {
                return jsonResult(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    true,
                );
            }
        },
    );

    server.registerTool(
        "read_memory_entry",
        {
            title: "Read Collective Memory Entry",
            description:
                "Read a markdown or text file from the shared Pollinations collective-memory repository by relative path (e.g. 'README.md', 'collabs/README.md', or 'pollinations/...').",
            inputSchema: z.object({
                path: z
                    .string()
                    .trim()
                    .min(1)
                    .describe(
                        "Relative file path in pollinations/collective-memory, e.g. 'README.md' or 'collabs/README.md'.",
                    ),
            }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ path }) => {
            try {
                const cleanPath = normalizeRepoPath(path);
                const entry = await fetchRawEntry(cleanPath);
                return jsonResult(entry);
            } catch (error) {
                return jsonResult(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    true,
                );
            }
        },
    );

    server.registerTool(
        "search_memory",
        {
            title: "Search Collective Memory",
            description:
                "Search markdown notes in the shared Pollinations collective-memory repository by keyword or phrase across file paths and note contents.",
            inputSchema: z.object({
                query: z
                    .string()
                    .trim()
                    .min(1)
                    .max(120)
                    .describe(
                        "Keywords or phrase to search for across collective-memory paths and markdown contents.",
                    ),
                space: z
                    .string()
                    .trim()
                    .min(1)
                    .optional()
                    .describe(
                        "Optional directory prefix to scope the search (e.g. 'collabs', 'knowledge', 'pollinations', 'social').",
                    ),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(20)
                    .default(8)
                    .describe("Maximum number of matching notes to return."),
            }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ query, space, limit }) => {
            try {
                const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
                const cleanSpace = space
                    ? normalizeRepoPath(space).replace(/\/+$/, "")
                    : undefined;

                const blobs = await fetchTree();
                const mdBlobs = blobs.filter((b) => {
                    if (!b.path.toLowerCase().endsWith(".md")) return false;
                    if (
                        cleanSpace &&
                        b.path !== cleanSpace &&
                        !b.path.startsWith(`${cleanSpace}/`)
                    ) {
                        return false;
                    }
                    return true;
                });

                const scored = mdBlobs
                    .map((b) => {
                        const lowerPath = b.path.toLowerCase();
                        const pathHits = terms.filter((t) =>
                            lowerPath.includes(t),
                        ).length;
                        return { blob: b, pathHits };
                    })
                    .sort(
                        (a, b) =>
                            b.pathHits - a.pathHits ||
                            b.blob.path.localeCompare(a.blob.path),
                    );

                const candidates = scored.slice(
                    0,
                    Math.min(scored.length, Math.max(limit * 2, 12)),
                );

                const inspected = await Promise.all(
                    candidates.map(async ({ blob, pathHits }) => {
                        try {
                            const entry = await fetchRawEntry(blob.path);
                            if (typeof entry.content !== "string") return null;
                            const snippets = extractMatchingSnippets(
                                entry.content,
                                terms,
                            );
                            if (pathHits === 0 && snippets.length === 0) {
                                return null;
                            }
                            return {
                                path: blob.path,
                                webUrl: entry.webUrl,
                                rawUrl: entry.rawUrl,
                                pathMatch: pathHits > 0,
                                snippets,
                            };
                        } catch {
                            return null;
                        }
                    }),
                );

                const matches = inspected.filter(Boolean).slice(0, limit);
                return jsonResult({
                    query,
                    ...(cleanSpace ? { space: cleanSpace } : {}),
                    matchCount: matches.length,
                    matches,
                });
            } catch (error) {
                return jsonResult(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    true,
                );
            }
        },
    );

    return server;
}

function readBearerToken(request) {
    return (
        request.headers
            .get("authorization")
            ?.trim()
            .match(/^Bearer\s+(\S+)$/i)?.[1] ?? null
    );
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message:
                "Send your Pollinations API key as Authorization: Bearer <key>. Get one at https://enter.pollinations.ai",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate":
                    'Bearer realm="collective-memory-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                status: "ok",
                service: "collective-memory-mcp",
                endpoint: "/",
            });
        }

        if (url.pathname !== "/") {
            return Response.json(
                {
                    error: "not_found",
                    message: "The MCP endpoint is served at /.",
                },
                { status: 404 },
            );
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

        const handler = createMcpHandler(() => buildServer(), {
            legacy: "stateless",
            onerror: (error) => console.error(error),
        });

        return handler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
