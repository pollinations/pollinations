import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const WIKTIONARY_API_URL =
    "https://en.wiktionary.org/api/rest_v1/page/definition";

async function fetchDefinitions(word) {
    const response = await fetch(
        `${WIKTIONARY_API_URL}/${encodeURIComponent(word)}`,
        {
            headers: {
                "User-Agent": "dictionary-mcp/0.1 (pollinations)",
            },
            signal: AbortSignal.timeout(10_000),
        },
    );
    if (response.status === 404) {
        throw new Error(`"${word}" was not found on Wiktionary.`);
    }
    if (!response.ok) {
        throw new Error(`Wiktionary returned HTTP ${response.status}.`);
    }
    return response.json();
}

const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "\u2014",
    ndash: "\u2013",
    hellip: "\u2026",
    lsquo: "\u2018",
    rsquo: "\u2019",
    ldquo: "\u201c",
    rdquo: "\u201d",
};

// ponytail: single-pass entity decode, so a definition that repeats entities
// never double-decodes. Upgrade path: a real HTML parser if callers need
// richer markup handling.
function decodeEntities(value) {
    return value
        .replace(
            /&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi,
            (entity, hex, code, name) => {
                if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
                if (code) return String.fromCodePoint(Number(code));
                return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
            },
        )
        .replace(/\s+/g, " ")
        .trim();
}

function extractText(html) {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanText(value) {
    return decodeEntities(extractText(value ?? "")).replace(
        /\s+([,.;:!?])/g,
        "$1",
    );
}

function selectEntries(payload, language) {
    const wanted = language.toLowerCase();
    for (const [code, entries] of Object.entries(payload)) {
        if (code.toLowerCase() === wanted) {
            return { entries, matchedBy: code };
        }
    }
    for (const [code, entries] of Object.entries(payload)) {
        if (
            entries.some(
                (entry) => (entry.language ?? "").toLowerCase() === wanted,
            )
        ) {
            return { entries, matchedBy: code };
        }
    }
    return { entries: [], matchedBy: null };
}

const defineSchema = z.object({
    word: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .describe("Word to define, e.g. `serendipity` or `ad hoc`."),
    language: z
        .string()
        .trim()
        .min(2)
        .max(32)
        .default("English")
        .describe(
            "Language name or code to look the word up in, e.g. `English`, " +
                "`en`, `Finnish`. Defaults to English.",
        ),
});

function buildServer() {
    const server = new McpServer(
        { name: "dictionary-mcp", title: "Dictionary MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "define",
        {
            description:
                "Look a word up in Wiktionary and return its definitions " +
                "with part of speech and usage examples for a language. " +
                "Words are sent to Wiktionary without caller credentials.",
            inputSchema: defineSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ word, language }) => {
            const payload = await fetchDefinitions(word);
            const { entries, matchedBy } = selectEntries(payload, language);
            if (entries.length === 0) {
                throw new Error(
                    `No ${language} definitions found for "${word}" on Wiktionary.`,
                );
            }
            return createMCPResponse([
                createTextContent(
                    {
                        word,
                        language: matchedBy,
                        entries: entries.map((entry) => ({
                            partOfSpeech: entry.partOfSpeech,
                            definitions: (entry.definitions ?? []).map(
                                (definition) => ({
                                    definition: cleanText(
                                        definition.definition,
                                    ),
                                    example: definition.examples?.[0]?.example
                                        ? cleanText(
                                              definition.examples[0].example,
                                          )
                                        : undefined,
                                }),
                            ),
                        })),
                    },
                    true,
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
                name: "dictionary-mcp",
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
                            'Bearer realm="dictionary-mcp.pollinations.ai"',
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
