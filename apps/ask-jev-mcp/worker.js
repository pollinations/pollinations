import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
    postChatCompletion,
} from "../../packages/mcp/src/utils/coreUtils.js";
import { jevInputSchema } from "./jev.js";

function buildServer() {
    const server = new McpServer(
        { name: "ask-jev-mcp", title: "Ask Jev MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "jev_decide",
        {
            description:
                "Evaluate state with independent choice, ordered score, or noul (probability) questions. " +
                "Supply relevant facts in state; confidence can remain high when facts are missing. " +
                "Choice criteria map options to descriptions; optional noul criteria.true/false define yes/no. " +
                "Read score legends; handle counting, arithmetic, and date comparisons in code.",
            inputSchema: z.object(jevInputSchema),
        },
        async ({ state, questions }, context) => {
            const result = await postChatCompletion(
                {
                    model: "typesafe/jev",
                    messages: [
                        {
                            role: "user",
                            content: JSON.stringify({ state, questions }),
                        },
                    ],
                },
                context,
            );
            const answers = JSON.parse(result.choices?.[0]?.message?.content);
            return createMCPResponse([createTextContent(answers, true)]);
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
                    'Bearer realm="ask-jev-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "ask-jev-mcp",
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
