import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
    postChatCompletion,
} from "../../packages/mcp/src/utils/coreUtils.js";

export const DEFAULT_MODELS = [
    "openai/gpt-5.4-nano",
    "qwen/qwen3.8-flash",
    "deepseek/deepseek-v4.1-flash",
];
const MAX_MODELS = 5;

async function askModel(model, question, context) {
    try {
        const response = await postChatCompletion(
            {
                model,
                messages: [{ role: "user", content: question }],
            },
            context,
        );
        const answer = response?.choices?.[0]?.message?.content;
        if (typeof answer !== "string" || !answer.trim()) {
            return { model, error: "Empty answer." };
        }
        return { model, answer: answer.trim() };
    } catch (error) {
        return {
            model,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

function buildServer() {
    const server = new McpServer(
        {
            name: "second-opinion-mcp",
            title: "Second Opinion MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "second_opinion",
        {
            description:
                "Ask the same question to several different models and get their answers side by side. " +
                "Use it to cross-check a fact, a plan or a piece of code before you rely on it. " +
                "Compare the answers yourself: where they agree you can be more confident, " +
                "where they differ look closer. Each model call is billed at that model's rate.",
            inputSchema: z.object({
                question: z
                    .string()
                    .min(1)
                    .describe("The question or task to send to every model."),
                models: z
                    .array(z.string().min(1))
                    .min(1)
                    .max(MAX_MODELS)
                    .optional()
                    .describe(
                        `Model ids to ask (1-${MAX_MODELS}). Defaults to ${DEFAULT_MODELS.join(", ")}.`,
                    ),
            }),
        },
        async ({ question, models }, context) => {
            const ids = [...new Set(models ?? DEFAULT_MODELS)];
            const results = await Promise.all(
                ids.map((model) => askModel(model, question, context)),
            );
            const failed = results.length - results.filter((r) => r.answer).length;
            const response = createMCPResponse([
                createTextContent({ question, results }, true),
            ]);
            if (failed === results.length) response.isError = true;
            return response;
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
                "WWW-Authenticate":
                    'Bearer realm="second-opinion-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "second-opinion-mcp",
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
