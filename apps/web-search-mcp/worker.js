import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

class SearchFailure extends Error {}

function citationsFromMessage(message) {
    const citations = [];
    const seen = new Set();
    for (const annotation of message?.annotations ?? []) {
        const citation = annotation?.url_citation;
        if (
            annotation?.type !== "url_citation" ||
            typeof citation?.url !== "string" ||
            seen.has(citation.url)
        ) {
            continue;
        }
        seen.add(citation.url);
        citations.push({
            title:
                typeof citation.title === "string"
                    ? citation.title
                    : citation.url,
            url: citation.url,
        });
    }
    return citations;
}

function searchResult(answer, citations) {
    const additionalSources = citations.filter(
        ({ url }) => !answer.includes(url),
    );
    const sources = additionalSources.length
        ? `\n\nSources:\n${additionalSources.map(({ title, url }) => `- [${title}](${url})`).join("\n")}`
        : "";
    return {
        content: [{ type: "text", text: `${answer}${sources}` }],
    };
}

async function searchWeb(params, env, authorization, fetchImpl) {
    const response = await fetchImpl(
        `${env.POLLINATIONS_BASE_URL}/v1/chat/completions`,
        {
            method: "POST",
            headers: {
                Authorization: authorization,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "openai-search",
                messages: [{ role: "user", content: params.query }],
                web_search_options: {
                    search_context_size: params.searchContextSize,
                },
            }),
        },
    );
    if (!response.ok) {
        const body = await response.text();
        throw new SearchFailure(
            body.slice(0, 1000) || `Search returned HTTP ${response.status}`,
        );
    }
    const completion = await response.json();
    const message = completion?.choices?.[0]?.message;
    if (typeof message?.content !== "string") {
        throw new SearchFailure("Search returned no answer");
    }
    return searchResult(message.content, citationsFromMessage(message));
}

function buildServer(env, authorization, fetchImpl) {
    const server = new McpServer(
        { name: "pollinations-web-search-mcp", version: "0.1.0" },
        {
            instructions:
                "Search the live web and answer with cited sources. Use searchWeb for current facts, news, or information that needs web verification.",
            capabilities: { tools: {} },
        },
    );
    server.registerTool(
        "searchWeb",
        {
            description:
                "Search the live web and return a concise answer with source links. Billed as an openai-search model request in Pollen.",
            inputSchema: z.object({
                query: z.string().min(1),
                searchContextSize: z
                    .enum(["low", "medium", "high"])
                    .optional()
                    .default("medium"),
            }),
        },
        (params) => searchWeb(params, env, authorization, fetchImpl),
    );
    return server;
}

export function createWorker({ fetchImpl = fetch } = {}) {
    return {
        async fetch(request, env) {
            const url = new URL(request.url);
            if (url.pathname !== "/") {
                return new Response("Not found", { status: 404 });
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

            const authorization = request.headers.get("authorization") ?? "";
            const handler = createMcpHandler(
                () => buildServer(env, authorization, fetchImpl),
                {
                    onerror: (error) => console.error(error),
                },
            );
            return handler.fetch(request);
        },
    };
}

export default createWorker();
