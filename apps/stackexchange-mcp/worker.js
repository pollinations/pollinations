import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const SERVER_NAME = "stackexchange-mcp";
const API_ROOT = "https://api.stackexchange.com/2.3";
const REQUEST_TIMEOUT_MS = 15_000;
const BODY_LIMIT = 12_000;
// The caller's Pollinations key authenticates the proxy, not this upstream.
// Stack Exchange is public, so the key is never sent to it.
const UPSTREAM_HEADERS = {
    Accept: "application/json",
    "User-Agent": `pollinations-${SERVER_NAME} (https://pollinations.ai)`,
};

const siteSchema = z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9.]+$/)
    .describe(
        "Stack Exchange site API slug, for example stackoverflow, superuser, askubuntu, math, or unix.",
    );

const limitSchema = z
    .number()
    .int()
    .min(1)
    .max(30)
    .describe("Maximum number of results to return.");

function textResult(value) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    };
}

function truncate(text, limit = BODY_LIMIT) {
    return text.length > limit
        ? `${text.slice(0, limit)}\n[cut at ${limit} characters]`
        : text;
}

const ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
        const key = entity.toLowerCase();
        if (key.startsWith("#x")) {
            const code = Number.parseInt(key.slice(2), 16);
            return code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        if (key.startsWith("#")) {
            const code = Number.parseInt(key.slice(1), 10);
            return code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        return ENTITIES[key] ?? match;
    });
}

const BLOCK_TAGS = new Set([
    "p",
    "div",
    "li",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
]);

// Stack Exchange returns rendered HTML. Agents read plain text better, so walk
// the markup once and keep text, line breaks, and entity characters.
export function htmlToText(html) {
    const input = String(html ?? "");
    let text = "";
    let inTag = false;
    let tagName = "";

    for (const char of input) {
        if (inTag) {
            if (char === ">") {
                inTag = false;
                const name = tagName
                    .trim()
                    .replace(/^\//, "")
                    .split(/\s+/)[0]
                    .toLowerCase();
                if (name === "br") {
                    text += "\n";
                } else if (BLOCK_TAGS.has(name)) {
                    text += "\n\n";
                }
                continue;
            }
            tagName += char;
            continue;
        }
        if (char === "<") {
            inTag = true;
            tagName = "";
            continue;
        }
        text += char;
    }

    return truncate(
        decodeEntities(text)
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
    );
}

export async function fetchStackExchange(path, params) {
    const url = new URL(`${API_ROOT}${path}`);
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
    }

    let response;
    try {
        response = await fetch(url, {
            headers: UPSTREAM_HEADERS,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new Error(
            "Stack Exchange is unreachable right now. Try again shortly.",
        );
    }

    const body = await response.text();
    let payload = null;
    try {
        payload = body ? JSON.parse(body) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw new Error(
            `Stack Exchange error (${response.status})${payload?.error_message ? `: ${payload.error_message}` : ""}`,
        );
    }
    if (payload?.error_id) {
        throw new Error(
            `Stack Exchange error: ${payload.error_message ?? payload.error_name ?? payload.error_id}`,
        );
    }
    if (payload?.backoff) {
        throw new Error(
            `Stack Exchange asked this client to back off for ${payload.backoff} seconds.`,
        );
    }
    return payload ?? {};
}

function questionSummary(item) {
    return {
        question_id: item.question_id,
        title: item.title,
        score: item.score,
        answer_count: item.answer_count,
        has_accepted_answer: Boolean(item.accepted_answer_id),
        views: item.view_count,
        tags: item.tags ?? [],
        owner: item.owner?.display_name ?? null,
        asked_at: item.creation_date
            ? new Date(item.creation_date * 1000).toISOString()
            : null,
        link: item.link,
    };
}

function answerSummary(item) {
    return {
        answer_id: item.answer_id,
        score: item.score,
        is_accepted: Boolean(item.is_accepted),
        owner: item.owner?.display_name ?? null,
        answered_at: item.creation_date
            ? new Date(item.creation_date * 1000).toISOString()
            : null,
        body: htmlToText(item.body),
    };
}

function buildServer() {
    const server = new McpServer(
        { name: SERVER_NAME, title: "Stack Exchange", version: "0.1.0" },
        {
            instructions:
                "Search Stack Overflow and the rest of the Stack Exchange network, then read a question with its top answers. Use search_questions to find candidates, then get_question for the full text. Answers are plain text and code is fenced.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "search_questions",
        {
            title: "Search questions",
            description:
                "Search questions on a Stack Exchange site by free text, tags, or both, and return titles, scores, answer counts, and links. Results are sorted by relevance by default.",
            inputSchema: z.object({
                query: z
                    .string()
                    .min(1)
                    .max(300)
                    .optional()
                    .describe(
                        "Free-text terms matched against question titles and bodies.",
                    ),
                tags: z
                    .array(z.string().min(1).max(50))
                    .min(1)
                    .max(5)
                    .optional()
                    .describe(
                        'Tags that must all be present, for example ["python", "asyncio"].',
                    ),
                site: siteSchema.default("stackoverflow"),
                sort: z
                    .enum(["relevance", "votes", "creation", "activity"])
                    .default("relevance")
                    .describe("Result order, highest first."),
                limit: limitSchema.default(10),
            }),
        },
        async ({ query, tags, site, sort, limit }) => {
            if (!query && !tags) {
                throw new Error("Provide a query, tags, or both.");
            }
            const payload = await fetchStackExchange("/search/advanced", {
                order: "desc",
                sort,
                q: query,
                tagged: tags?.join(";"),
                site,
                pagesize: limit,
            });
            return textResult({
                site,
                query: query ?? null,
                tags: tags ?? [],
                quota_remaining: payload.quota_remaining ?? null,
                has_more: Boolean(payload.has_more),
                questions: (payload.items ?? []).map(questionSummary),
            });
        },
    );

    server.registerTool(
        "get_question",
        {
            title: "Get question with answers",
            description:
                "Fetch one question by id together with its highest-voted answers. Code blocks are fenced and HTML is converted to plain text.",
            inputSchema: z.object({
                question_id: z
                    .number()
                    .int()
                    .positive()
                    .describe(
                        "Question id from search_questions or a Stack Exchange URL, for example 11227809.",
                    ),
                site: siteSchema.default("stackoverflow"),
                include_answers: z
                    .boolean()
                    .default(true)
                    .describe("Include answers alongside the question."),
                max_answers: z
                    .number()
                    .int()
                    .min(1)
                    .max(20)
                    .default(5)
                    .describe("Maximum number of top answers to include."),
            }),
        },
        async ({ question_id, site, include_answers, max_answers }) => {
            const questionPayload = await fetchStackExchange(
                `/questions/${question_id}`,
                { site, filter: "withbody" },
            );
            const item = questionPayload.items?.[0];
            if (!item) {
                throw new Error(`No question ${question_id} found on ${site}.`);
            }

            const answers = include_answers
                ? ((
                      await fetchStackExchange(
                          `/questions/${question_id}/answers`,
                          {
                              site,
                              filter: "withbody",
                              sort: "votes",
                              order: "desc",
                              pagesize: max_answers,
                          },
                      )
                  ).items ?? [])
                : [];

            return textResult({
                site,
                question: {
                    ...questionSummary(item),
                    body: htmlToText(item.body),
                },
                answers: answers.map(answerSummary),
            });
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
                "WWW-Authenticate": `Bearer realm="${SERVER_NAME}.pollinations.ai"`,
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: SERVER_NAME,
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
