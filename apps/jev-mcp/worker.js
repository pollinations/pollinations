import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
    postChatCompletion,
} from "../../packages/mcp/src/utils/coreUtils.js";
import {
    answersFromContent,
    jevInputSchema,
    questionsToProperties,
} from "./jev.js";

// DRAFT — do not merge or deploy until TypeSafe grants standalone-service permission.
function buildServer() {
    const server = new McpServer(
        { name: "jev-mcp", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "jev_decide",
        {
            description:
                "Make typed decisions about a state: choice, ordered score, or noul (probability). " +
                "Send multiple named questions in one call — they are answered in parallel and cannot see each other. " +
                "Jev judges the state you give it and does not know current events: put the evidence in state, " +
                "because without it Jev answers confidently and wrongly about anything recent. " +
                "For choice, criteria keys are the options and their descriptions explain when to select them. " +
                "For noul, optional criteria.true and criteria.false describe what yes and no mean. " +
                "Read a score's legend rather than assuming a direction — the number indexes the criteria order you sent. " +
                "Keep counting, arithmetic, and date comparison in your own code; Jev is unreliable at all three.",
            inputSchema: z.object(jevInputSchema),
        },
        async ({ state, questions }, context) => {
            const result = await postChatCompletion(
                {
                    model: "jev",
                    messages: [{ role: "user", content: state }],
                    response_format: {
                        type: "json_schema",
                        json_schema: {
                            name: "jev_decision",
                            schema: {
                                type: "object",
                                properties: questionsToProperties(questions),
                            },
                        },
                    },
                },
                context,
            );
            const content = JSON.parse(result.choices?.[0]?.message?.content);
            return createMCPResponse([
                createTextContent(answersFromContent(content, questions), true),
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
                "WWW-Authenticate": 'Bearer realm="jev-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "jev-mcp",
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
