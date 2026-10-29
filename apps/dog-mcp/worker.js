import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const DOG_API = "https://dog.ceo/api";

// Dog CEO is public and keyless, so the caller's Pollinations key is never forwarded.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.error) {
        const reason =
            typeof body?.error === "string"
                ? body.error
                : `Dog API request failed with status ${response.status}`;
        throw new Error(reason);
    }
    return body;
}

async function listBreeds() {
    const body = await fetchJson(`${DOG_API}/breeds/list`);
    const breeds = body?.message ?? {};
    return {
        count: Object.keys(breeds).length,
        breeds: Object.entries(breeds).map(([breed, subBreeds]) => ({
            breed,
            subBreeds: Array.isArray(subBreeds) ? subBreeds : [],
        })),
    };
}

async function randomDog() {
    const body = await fetchJson(`${DOG_API}/breeds/image/random`);
    return { image: body.message };
}

async function dogImageByBreed(breed) {
    const body = await fetchJson(
        `${DOG_API}/breed/${String(breed)}/images/random`,
    );
    return { breed, image: body.message };
}

function buildServer() {
    const server = new McpServer(
        { name: "dog-mcp", title: "Dog MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "listBreeds",
        {
            description:
                "List dog breeds from the Dog CEO API: returns every breed and its sub-breeds.",
            inputSchema: {},
        },
        async () => {
            const report = await listBreeds();
            return createMCPResponse([
                createTextContent(JSON.stringify(report, null, 2)),
            ]);
        },
    );
    server.registerTool(
        "randomDog",
        {
            description: "Return a random dog image URL from the Dog CEO API.",
            inputSchema: {},
        },
        async () => {
            const report = await randomDog();
            return createMCPResponse([
                createTextContent(JSON.stringify(report, null, 2)),
            ]);
        },
    );
    server.registerTool(
        "dogImageByBreed",
        {
            description:
                "Return a random dog image URL for a breed from the Dog CEO API.",
            inputSchema: {
                breed: z
                    .string()
                    .min(1)
                    .describe("Dog breed slug, e.g. 'retriever' or 'bulldog'"),
            },
        },
        async ({ breed }) => {
            const report = await dogImageByBreed(breed);
            return createMCPResponse([
                createTextContent(JSON.stringify(report, null, 2)),
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
                "WWW-Authenticate": 'Bearer realm="dog-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "dog-mcp",
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
