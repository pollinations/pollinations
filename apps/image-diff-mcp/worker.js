import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";

const MAX_IMAGE_REF_LENGTH = 8 * 1024 * 1024; // 8 MB, applies to data: URIs
const DEFAULT_MODEL = "openai";

const CompareImagesInputSchema = z.object({
    image_a: z
        .string()
        .min(1, "image_a is required")
        .max(
            MAX_IMAGE_REF_LENGTH,
            "image_a exceeds the 8 MB size cap for data URIs",
        ),
    image_b: z
        .string()
        .min(1, "image_b is required")
        .max(
            MAX_IMAGE_REF_LENGTH,
            "image_b exceeds the 8 MB size cap for data URIs",
        ),
    focus: z
        .string()
        .max(200, "focus must be 200 characters or fewer")
        .optional(),
    model: z.string().min(1).optional(),
});

const CompareResultSchema = {
    type: "object",
    properties: {
        identical: { type: "boolean" },
        similarity: {
            type: "string",
            enum: [
                "identical",
                "minor_differences",
                "major_differences",
                "unrelated",
            ],
        },
        differences: { type: "array", items: { type: "string" } },
        legibility: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["identical", "similarity", "differences", "legibility"],
    additionalProperties: false,
};

function isValidImageRef(value) {
    if (value.startsWith("data:")) {
        return /^data:[a-zA-Z0-9.+/-]+;base64,.+/.test(value);
    }
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function buildInstruction(focus) {
    const base =
        "Compare the two images that follow. Describe concrete, visible " +
        "differences in a short list. If you are not confident you can " +
        "reliably judge the images (too small, too similar, unclear), say " +
        "so honestly via the legibility field rather than guessing.";
    if (!focus) return base;
    return `${base} Focus specifically on differences related to: ${focus}.`;
}

function buildServer() {
    const server = new McpServer(
        { name: "image-diff-mcp", title: "Image Diff MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "compare_images",
        {
            description:
                "Compare two images (URL or data URI) using a vision model and " +
                "return a structured description of their differences. " +
                "Does not produce pixel-level bounding boxes or similarity " +
                "percentages — vision models cannot give those reliably, so " +
                "the result is a coarse similarity bucket plus a described " +
                "list of differences, with an honest confidence signal.",
            inputSchema: CompareImagesInputSchema,
        },
        async ({ image_a, image_b, focus, model }, context) => {
            if (!isValidImageRef(image_a)) {
                throw new Error(
                    "image_a must be an http(s) URL or a base64 data: URI",
                );
            }
            if (!isValidImageRef(image_b)) {
                throw new Error(
                    "image_b must be an http(s) URL or a base64 data: URI",
                );
            }

            const response = await fetchJsonWithAuth(
                buildUrl("/v1/chat/completions"),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: model || DEFAULT_MODEL,
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: buildInstruction(focus),
                                    },
                                    {
                                        type: "image_url",
                                        image_url: { url: image_a },
                                    },
                                    {
                                        type: "image_url",
                                        image_url: { url: image_b },
                                    },
                                ],
                            },
                        ],
                        response_format: {
                            type: "json_schema",
                            json_schema: {
                                name: "compare_result",
                                schema: CompareResultSchema,
                                strict: true,
                            },
                        },
                    }),
                },
                context,
            );

            const content = response?.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error("Vision model returned no comparison result");
            }

            let result;
            try {
                result = JSON.parse(content);
            } catch {
                throw new Error(
                    "Vision model returned malformed comparison JSON",
                );
            }

            return createMCPResponse([createTextContent(result, true)]);
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
                    'Bearer realm="image-diff-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "image-diff-mcp",
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
