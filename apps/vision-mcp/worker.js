import { Buffer } from "node:buffer";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { readResponseBytes } from "../../shared/response-bytes.ts";
import { validateUserMediaUrl } from "../../shared/user-media-url.ts";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 5;

class VisionFailure extends Error {}

const imageUrlSchema = z.url().refine((value) => {
    const validation = validateUserMediaUrl(value);
    return validation.ok && validation.url.protocol === "https:";
}, "imageUrl must be a public HTTPS URL without credentials");

async function fetchImageDataUrl(value, fetchImpl) {
    let url = validateUserMediaUrl(value).url;
    let response;
    for (let redirects = 0; ; redirects += 1) {
        response = await fetchImpl(url, { redirect: "manual" });
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get("location");
        if (!location || redirects >= MAX_REDIRECTS) {
            throw new VisionFailure("Image has an invalid redirect");
        }
        await response.body?.cancel();
        const validation = validateUserMediaUrl(
            new URL(location, url).toString(),
        );
        if (!validation.ok || validation.url.protocol !== "https:") {
            throw new VisionFailure("Image has an unsafe redirect");
        }
        url = validation.url;
    }
    if (!response.ok) {
        throw new VisionFailure(`Image returned HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!contentType?.startsWith("image/")) {
        throw new VisionFailure("URL did not return an image");
    }
    const bytes = await readResponseBytes(
        response,
        MAX_IMAGE_BYTES,
        () => new VisionFailure("Image exceeds 20 MB"),
    );
    if (bytes.byteLength === 0) {
        throw new VisionFailure("Image is empty");
    }
    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function analyzeImage(params, env, authorization, fetchImpl) {
    const imageDataUrl = await fetchImageDataUrl(params.imageUrl, fetchImpl);
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
                                image_url: { url: imageDataUrl },
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

function buildServer(env, authorization, fetchImpl) {
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
        (params) => analyzeImage(params, env, authorization, fetchImpl),
    );
    return server;
}

export function createWorker({ fetchImpl = fetch } = {}) {
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
