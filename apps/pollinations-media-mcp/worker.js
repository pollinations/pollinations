import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

function buildServer() {
    const server = new McpServer(
        {
            name: "pollinations-media-mcp",
            title: "Pollinations Media MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "generate_image",
        {
            description: "Generate an image from a prompt and return its URL.",
            inputSchema: {
                prompt: z.string(),
                model: z.string().optional(),
                width: z.number().optional(),
                height: z.number().optional(),
            },
        },
        async ({ prompt, model, width, height }, _context) => {
            const params = new URLSearchParams();
            if (model) params.set("model", model);
            if (width) params.set("width", String(width));
            if (height) params.set("height", String(height));
            const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}${params.toString() ? `?${params.toString()}` : ""}`;
            return { content: [{ type: "text", text: url }] };
        },
    );
    server.registerTool(
        "generate_audio",
        {
            description: "Generate audio from text and return its URL.",
            inputSchema: {
                text: z.string(),
                voice: z.string().optional(),
            },
        },
        async ({ text, voice }) => {
            const params = new URLSearchParams();
            if (voice) params.set("voice", voice);
            const url = `https://gen.pollinations.ai/audio/${encodeURIComponent(text)}${params.toString() ? `?${params.toString()}` : ""}`;
            return { content: [{ type: "text", text: url }] };
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
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
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
                    'Bearer realm="pollinations-media-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "pollinations-media-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }
        if (url.pathname !== "/")
            return new Response("Not found", { status: 404 });
        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();
        return mcpHandler.fetch(request, {
            authInfo: { token, clientId: "pollinations-api-key", scopes: [] },
        });
    },
};
