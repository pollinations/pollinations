import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";
import { chunkText, formatDigest } from "./digest.js";

const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const MAX_CHARS = 60000;
const MAX_CHUNK = 12000;

/** Strip tags and scripts so a model sees reading, not markup. */
export function readableText(html) {
    return String(html ?? "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/^\s+/, "")
        .trim();
}

const SUMMARISE = (instruction) =>
    `Summarise in that many words or fewer. Keep names, numbers, dates and any ` +
    `decision or instruction exactly as written. Drop navigation and boilerplate. ` +
    `Answer in the same language as the text. ${instruction}`;

function buildServer() {
    const server = new McpServer(
        { name: "digest-mcp", title: "Digest MCP", version: "0.1.0" },
        {
            capabilities: { tools: {} },
            instructions:
                "digest-mcp reads a page or a long text and returns a compact " +
                "summary in parts. Use read_url for a clean text version of a " +
                "page, digest_text when you already hold the text. Both bill the " +
                "model calls to the caller's Pollen; use listModels to choose.",
        },
    );

    server.registerTool(
        "read_url",
        {
            description:
                "Fetch one public page and return its readable text, without scripts, styles or markup. " +
                "Useful before digest_text when the source is a URL. Returns 404/403 as-is rather than retrying.",
            inputSchema: z.object({
                url: z.string().describe("Absolute http(s) URL to read."),
                max_chars: z
                    .number()
                    .int()
                    .min(500)
                    .max(MAX_CHARS)
                    .optional()
                    .describe(
                        `Character cap for the returned text (<= ${MAX_CHARS}).`,
                    ),
            }),
        },
        async ({ url, max_chars }, _context) => {
            const response = await fetch(url, {
                headers: { accept: "text/html, text/plain;q=0.9, */*;q=0.5" },
            });
            if (!response.ok) {
                throw new Error(
                    `Fetching ${url} returned HTTP ${response.status}. The page may need a login, or block automated reads.`,
                );
            }
            const raw = await response.text();
            const text = readableText(raw);
            const cap = Math.min(max_chars ?? MAX_CHARS, MAX_CHARS);
            const trimmed =
                text.length > cap
                    ? `${text.slice(0, cap)}\n\n[truncated]`
                    : text;
            if (!trimmed) {
                throw new Error(
                    `No readable text at ${url}. The page may render client-side.`,
                );
            }
            return createMCPResponse([createTextContent(trimmed)]);
        },
    );

    server.registerTool(
        "digest_text",
        {
            description:
                "Summarise a long text or page in parts, so nothing falls outside the context window. " +
                "Chunks on paragraph and sentence boundaries, summarises each in order, then returns them joined. " +
                "Pass a url instead of text to read it first. Check the live model list with listModels; " +
                "nano models are cheapest for this.",
            inputSchema: z.object({
                text: z
                    .string()
                    .optional()
                    .describe("Text to summarise. Provide this or url."),
                url: z
                    .string()
                    .optional()
                    .describe(
                        "Read this http(s) page and summarise it instead of text.",
                    ),
                model: z
                    .string()
                    .optional()
                    .describe(
                        `Text model to use (default ${DEFAULT_MODEL}). Call listModels for live names and prices.`,
                    ),
                words_per_part: z
                    .number()
                    .int()
                    .min(20)
                    .max(400)
                    .optional()
                    .describe(
                        "Target summary length per part, in words (default 120).",
                    ),
                max_chars: z
                    .number()
                    .int()
                    .min(500)
                    .max(MAX_CHARS)
                    .optional()
                    .describe(
                        `Stop reading after this many characters (<= ${MAX_CHARS}).`,
                    ),
            }),
        },
        async ({ text, url, model, words_per_part, max_chars }, context) => {
            if (!text && !url) throw new Error("Provide text or url.");
            const source = url ?? "inline text";
            let body = text ?? "";

            if (url) {
                const response = await fetch(url, {
                    headers: {
                        accept: "text/html, text/plain;q=0.9, */*;q=0.5",
                    },
                });
                if (!response.ok) {
                    throw new Error(
                        `Fetching ${url} returned HTTP ${response.status}. The page may need a login, or block automated reads.`,
                    );
                }
                body = readableText(await response.text());
            }

            const cap = Math.min(max_chars ?? MAX_CHARS, MAX_CHARS);
            const source_chars = body.length;
            if (body.length > cap) body = body.slice(0, cap);
            const chunks = chunkText(body, MAX_CHUNK);
            if (!chunks.length)
                throw new Error(`No readable text at ${source}.`);

            const words = words_per_part ?? 120;
            const chosen = model || DEFAULT_MODEL;
            const parts = [];
            for (const chunk of chunks) {
                const { choices } = await fetchJsonWithAuth(
                    buildUrl("/v1/chat/completions"),
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: chosen,
                            max_tokens: Math.min(1200, words * 4),
                            messages: [
                                {
                                    role: "system",
                                    content: SUMMARISE(
                                        `Aim for about ${words} words.`,
                                    ),
                                },
                                { role: "user", content: chunk },
                            ],
                        }),
                    },
                    context,
                );
                const answer = choices?.[0]?.message?.content?.trim();
                if (!answer) throw new Error("The model returned no summary.");
                parts.push(answer);
            }

            return createMCPResponse([
                createTextContent(
                    formatDigest({
                        parts,
                        source,
                        charCount: source_chars,
                        model: chosen,
                    }),
                ),
            ]);
        },
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
                "WWW-Authenticate": 'Bearer realm="digest-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "digest-mcp",
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
