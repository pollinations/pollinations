import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";

const DEFAULT_MODEL = "black-forest-labs/flux.1-kontext-pro";

function buildServer() {
    const server = new McpServer(
        { name: "image-edit-mcp", title: "Image Edit MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "edit_image",
        {
            description:
                "Edit one or more source images with a text prompt. Returns the edited image URL. " +
                "Pass public HTTPS URLs or data:image/...;base64 URIs. Models that take several " +
                "references accept up to 8 images. Defaults to black-forest-labs/flux.1-kontext-pro; " +
                "call list_image_edit_models to see alternatives. The caller's Pollen pays for the generation.",
            inputSchema: z.object({
                prompt: z
                    .string()
                    .min(1)
                    .max(32000)
                    .describe(
                        "The edit to apply, e.g. 'replace the sky with a sunset'",
                    ),
                image: z
                    .union([z.string(), z.array(z.string()).min(1).max(8)])
                    .describe(
                        "Source image URL(s) or data:image/...;base64 URI(s). A single string or an array.",
                    ),
                model: z
                    .string()
                    .optional()
                    .describe(`Image edit model id. Default: ${DEFAULT_MODEL}`),
                size: z
                    .string()
                    .optional()
                    .describe("Output size as WIDTHxHEIGHT, e.g. 1024x1024"),
                quality: z
                    .enum(["low", "medium", "high", "standard", "hd"])
                    .optional()
                    .describe("Output quality. standard/hd map to medium/high"),
                seed: z
                    .number()
                    .int()
                    .min(-1)
                    .max(2147483647)
                    .optional()
                    .describe("Seed for reproducible edits"),
                safe: z
                    .boolean()
                    .optional()
                    .describe("Enable safety filtering (default true)"),
            }),
        },
        async (
            { prompt, image, model, size, quality, seed, safe },
            context,
        ) => {
            const images = Array.isArray(image) ? image : [image];
            const body = {
                prompt,
                model: model || DEFAULT_MODEL,
                image: images.map((image_url) => ({ image_url })),
                response_format: "url",
            };
            if (size) body.size = size;
            if (quality) body.quality = quality;
            if (seed !== undefined) body.seed = seed;
            if (safe !== undefined) body.safe = safe;

            const result = await fetchJsonWithAuth(
                buildUrl("/v1/images/edits"),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
                context,
            );

            const edited = (result.data || []).map((item) => ({
                url: item.url,
                revised_prompt: item.revised_prompt,
            }));
            return createMCPResponse([
                createTextContent(
                    {
                        model: model || DEFAULT_MODEL,
                        images: edited,
                        usage: result.usage,
                    },
                    true,
                ),
            ]);
        },
    );

    server.registerTool(
        "list_image_edit_models",
        {
            description:
                "List the image models that accept /v1/images/edits, with their ids and descriptions. " +
                "Use it to pick a model for edit_image.",
            inputSchema: z.object({}),
        },
        async (_args, context) => {
            const result = await fetchJsonWithAuth(
                buildUrl("/v1/models"),
                {},
                context,
            );
            const models = (result.data || [])
                .filter((model) =>
                    (model.supported_endpoints || []).includes(
                        "/v1/images/edits",
                    ),
                )
                .map((model) => ({
                    id: model.id,
                    description: model.description,
                    paid_only: model.paid_only,
                }));
            return createMCPResponse([createTextContent({ models }, true)]);
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
                    'Bearer realm="image-edit-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "image-edit-mcp",
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
