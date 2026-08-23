import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { validateUserMediaUrl } from "../../shared/user-media-url.ts";

class VisionFailure extends Error {}

const imageUrlSchema = z.url().refine((value) => {
    const validation = validateUserMediaUrl(value);
    return validation.ok && validation.url.protocol === "https:";
}, "imageUrl must be a public HTTPS URL without credentials");

async function analyzeImage(params, env, authorization) {
    const response = await env.GEN.fetch(
        "https://gen.pollinations.ai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                Authorization: authorization,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: params.model,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: params.question },
                            {
                                type: "image_url",
                                image_url: { url: params.imageUrl },
                            },
                        ],
                    },
                ],
            }),
        },
    );
    if (!response.ok) {
        const body = await response.text();
        throw new VisionFailure(
            body.slice(0, 1000) ||
                `Image analysis returned HTTP ${response.status}`,
        );
    }
    const completion = await response.json();
    const answer = completion?.choices?.[0]?.message?.content;
    if (typeof answer !== "string") {
        throw new VisionFailure("Image analysis returned no answer");
    }
    return { content: [{ type: "text", text: answer }] };
}

function buildServer(env, authorization) {
    const server = new McpServer(
        { name: "pollinations-vision-mcp", version: "0.1.0" },
        {
            instructions:
                "Inspect images from public HTTPS URLs. Use analyzeImage to describe visual content, answer questions, or extract visible text.",
            capabilities: { tools: {} },
        },
    );
    server.registerTool(
        "analyzeImage",
        {
            description:
                "Analyze an image, answer a visual question, or extract visible text with a Pollinations vision model. Billed through the normal text API in Pollen.",
            inputSchema: z.object({
                imageUrl: imageUrlSchema,
                question: z
                    .string()
                    .optional()
                    .default("Describe this image in detail."),
                model: z.string().optional().default("openai"),
            }),
        },
        (params) => analyzeImage(params, env, authorization),
    );
    return server;
}

export function createWorker() {
    return {
        async fetch(request, env) {
            if (new URL(request.url).pathname !== "/") {
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
                () => buildServer(env, authorization),
                {
                    onerror: (error) => console.error(error),
                },
            );
            return handler.fetch(request);
        },
    };
}

export default createWorker();
