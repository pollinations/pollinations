import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
    postChatCompletion,
} from "../../packages/mcp/src/utils/coreUtils.js";

// The API's documented vision example: cheap, multimodal and available to free tiers.
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
// OpenAI and Azure reject images above 20 MB.
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
// One retry after a rejected reply, then fail instead of looping on a billed model.
const MAX_ATTEMPTS = 2;

const IMAGE_DESCRIPTION =
    "Public https image URL, or a data URI such as data:image/png;base64,... (max 20 MB).";

/**
 * Accepts a public https URL or an image data URI and returns the value to send
 * to the API. Bad input fails before a billed request is made.
 */
function normalizeImage(image) {
    const value = image.trim();
    if (!value) {
        throw new Error("Image is required.");
    }

    if (value.startsWith("data:")) {
        const dataUri = value.match(/^data:([^;,]+);base64,([\s\S]*)$/);
        if (!dataUri) {
            throw new Error(
                "Image data URI must be base64-encoded, like data:image/png;base64,...",
            );
        }
        const mimeType = dataUri[1].toLowerCase();
        if (!mimeType.startsWith("image/")) {
            throw new Error(
                `Image data URI must be an image, got ${mimeType}.`,
            );
        }
        const base64 = dataUri[2].replace(/\s+/g, "");
        if (
            !base64 ||
            base64.length % 4 !== 0 ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
        ) {
            throw new Error(
                "Image data URI must contain base64-encoded bytes.",
            );
        }
        const padding = base64.endsWith("==")
            ? 2
            : base64.endsWith("=")
              ? 1
              : 0;
        const bytes = (base64.length * 3) / 4 - padding;
        if (bytes > MAX_IMAGE_BYTES) {
            throw new Error(
                `Image is too large: ${bytes} bytes, limit is ${MAX_IMAGE_BYTES}.`,
            );
        }
        return `data:${mimeType};base64,${base64}`;
    }

    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(
            "Image must be a public https URL or a base64 image data URI.",
        );
    }
    if (url.protocol !== "https:") {
        throw new Error("Image URL must use https.");
    }
    return url.toString();
}

function imagePart(image, detail) {
    const part = { type: "image_url", image_url: { url: image } };
    if (detail && detail !== "auto") {
        part.image_url.detail = detail;
    }
    return part;
}

function userContent(text, image, detail) {
    return image ? [{ type: "text", text }, imagePart(image, detail)] : text;
}

function readAnswer(payload) {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
        return content.trim();
    }
    if (Array.isArray(content)) {
        const text = content
            .map((part) =>
                typeof part === "string" ? part : (part?.text ?? ""),
            )
            .join("")
            .trim();
        if (text) {
            return text;
        }
    }
    throw new Error("The model returned no text.");
}

function typeOf(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (Number.isInteger(value)) return "integer";
    return typeof value;
}

function matchesType(value, type) {
    const actual = typeOf(value);
    if (type === "integer") return actual === "integer";
    if (type === "number") return actual === "number" || actual === "integer";
    return actual === type;
}

/**
 * Validates the subset of JSON Schema `extract_data` documents: type, enum,
 * required, properties, additionalProperties and items.
 */
function validateValue(value, schema, path = "$", errors = []) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        return errors;
    }

    if (schema.type !== undefined) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        if (!types.some((type) => matchesType(value, type))) {
            errors.push(
                `${path} must be ${types.join(" or ")}, got ${typeOf(value)}`,
            );
            return errors;
        }
    }

    if (Array.isArray(schema.enum)) {
        const serialized = JSON.stringify(value);
        if (
            !schema.enum.some((option) => JSON.stringify(option) === serialized)
        ) {
            errors.push(
                `${path} must be one of ${JSON.stringify(schema.enum)}`,
            );
        }
    }

    if (typeOf(value) === "object") {
        const properties = schema.properties ?? {};
        for (const key of schema.required ?? []) {
            if (!(key in value)) {
                errors.push(`${path}.${key} is required`);
            }
        }
        for (const [key, child] of Object.entries(value)) {
            if (Object.hasOwn(properties, key)) {
                validateValue(child, properties[key], `${path}.${key}`, errors);
            } else if (schema.additionalProperties === false) {
                errors.push(`${path}.${key} is not allowed`);
            }
        }
    }

    if (Array.isArray(value) && schema.items) {
        value.forEach((item, index) => {
            validateValue(item, schema.items, `${path}[${index}]`, errors);
        });
    }

    return errors;
}

function parseJson(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = (fenced ? fenced[1] : text).trim();
    try {
        return JSON.parse(body);
    } catch {}

    // Models occasionally wrap the value in a sentence; take the outermost one.
    const start = body.search(/[{[]/);
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
    if (start !== -1 && end > start) {
        try {
            return JSON.parse(body.slice(start, end + 1));
        } catch {}
    }
    throw new Error("Response was not JSON.");
}

function buildServer() {
    const server = new McpServer(
        { name: "vision-mcp", title: "Vision MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "describe_image",
        {
            description:
                "Look at an image and answer a question about it with a Pollinations vision model, " +
                "billed to the caller's key at the model's listed rate. " +
                "Use it for screenshots, photos, charts and diagrams.",
            inputSchema: z.object({
                image: z.string().min(1).describe(IMAGE_DESCRIPTION),
                question: z
                    .string()
                    .min(1)
                    .max(4000)
                    .optional()
                    .describe(
                        "What to answer about the image, default a detailed description.",
                    ),
                model: z
                    .string()
                    .min(1)
                    .max(256)
                    .optional()
                    .describe(
                        `Vision model id from list_vision_models, default "${DEFAULT_MODEL}".`,
                    ),
                detail: z
                    .enum(["auto", "low", "high"])
                    .optional()
                    .describe(
                        "Image detail hint, default auto. Use high for small text or fine details.",
                    ),
            }),
        },
        async ({ image, question, model, detail }, context) => {
            const payload = await postChatCompletion(
                {
                    model: model ?? DEFAULT_MODEL,
                    messages: [
                        {
                            role: "user",
                            content: userContent(
                                question ??
                                    "Describe this image in detail: subjects, layout, notable details and any visible text.",
                                normalizeImage(image),
                                detail,
                            ),
                        },
                    ],
                },
                context,
            );
            return createMCPResponse([createTextContent(readAnswer(payload))]);
        },
    );

    server.registerTool(
        "read_text",
        {
            description:
                "Transcribe the text visible in an image (OCR) with a Pollinations vision model, " +
                "billed to the caller's key at the model's listed rate. " +
                "Returns the text in reading order, keeping line breaks.",
            inputSchema: z.object({
                image: z.string().min(1).describe(IMAGE_DESCRIPTION),
                language: z
                    .string()
                    .min(1)
                    .max(64)
                    .optional()
                    .describe(
                        "Expected language of the text, for example Indonesian or English.",
                    ),
                detail: z
                    .enum(["auto", "low", "high"])
                    .optional()
                    .describe(
                        "Image detail hint, default high so small text survives.",
                    ),
                model: z
                    .string()
                    .min(1)
                    .max(256)
                    .optional()
                    .describe(
                        `Vision model id from list_vision_models, default "${DEFAULT_MODEL}".`,
                    ),
            }),
        },
        async ({ image, language, detail, model }, context) => {
            const instruction = [
                "Transcribe every piece of text visible in this image.",
                "Keep the reading order and the original line breaks.",
                "Do not translate, summarize, describe the image or add commentary.",
                language ? `The text is most likely in ${language}.` : "",
                "If the image contains no readable text, reply with exactly NO_TEXT.",
            ]
                .filter(Boolean)
                .join(" ");
            const payload = await postChatCompletion(
                {
                    model: model ?? DEFAULT_MODEL,
                    messages: [
                        {
                            role: "user",
                            content: userContent(
                                instruction,
                                normalizeImage(image),
                                detail ?? "high",
                            ),
                        },
                    ],
                },
                context,
            );
            const text = readAnswer(payload);
            return createMCPResponse([
                createTextContent(
                    text === "NO_TEXT" ? "No readable text found." : text,
                ),
            ]);
        },
    );

    server.registerTool(
        "extract_data",
        {
            description:
                "Turn an image into JSON: read a receipt, table, form, chart or label and return the " +
                "fields you ask for, with a Pollinations vision model billed to the caller's key. " +
                "Pass schema to have the reply checked and retried once when it does not match.",
            inputSchema: z.object({
                image: z.string().min(1).describe(IMAGE_DESCRIPTION),
                instruction: z
                    .string()
                    .min(1)
                    .max(4000)
                    .describe(
                        "What to extract and how to name the fields, for example " +
                            '"line items as {description, quantity, price} and the total".',
                    ),
                schema: z
                    .record(z.string(), z.unknown())
                    .optional()
                    .describe(
                        "Optional JSON Schema for the result. Supports type, enum, required, " +
                            "properties, additionalProperties and items.",
                    ),
                detail: z
                    .enum(["auto", "low", "high"])
                    .optional()
                    .describe(
                        "Image detail hint, default high so small print survives.",
                    ),
                model: z
                    .string()
                    .min(1)
                    .max(256)
                    .optional()
                    .describe(
                        `Vision model id from list_vision_models, default "${DEFAULT_MODEL}".`,
                    ),
            }),
        },
        async ({ image, instruction, schema, detail, model }, context) => {
            const request = [
                "Extract data from this image.",
                instruction,
                "Reply with JSON only: no prose, no markdown fences.",
            ];
            if (schema) {
                request.push(
                    `The JSON must match this JSON Schema:\n${JSON.stringify(schema)}`,
                );
            }
            const messages = [
                {
                    role: "system",
                    content:
                        "You extract data from images. Reply with exactly one JSON value and nothing else.",
                },
                {
                    role: "user",
                    content: userContent(
                        request.join("\n"),
                        normalizeImage(image),
                        detail ?? "high",
                    ),
                },
            ];

            let problem = "";
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                const payload = await postChatCompletion(
                    { model: model ?? DEFAULT_MODEL, messages },
                    context,
                );
                const raw = readAnswer(payload);
                let value;
                try {
                    value = parseJson(raw);
                    const errors = schema ? validateValue(value, schema) : [];
                    if (!errors.length) {
                        return createMCPResponse([
                            createTextContent(value, true),
                        ]);
                    }
                    problem = `it did not match the schema: ${errors.join("; ")}`;
                } catch (error) {
                    problem = `it was not JSON (${error.message})`;
                }
                messages.push({ role: "assistant", content: raw });
                messages.push({
                    role: "user",
                    content: `That reply was rejected because ${problem}.\nReply again with JSON only.`,
                });
            }

            throw new Error(
                `The model did not return matching JSON in ${MAX_ATTEMPTS} attempts: ${problem}`,
            );
        },
    );

    server.registerTool(
        "list_vision_models",
        {
            description:
                "List the Pollinations models that accept image input, with their context window " +
                "and whether they support structured output. Free.",
            inputSchema: z.object({}),
        },
        async (_args, context) => {
            const models = await fetchJsonWithAuth(
                buildUrl("/text/models"),
                {},
                context,
            );
            const entries = Array.isArray(models)
                ? models
                : (models?.data ?? []);
            const vision = entries
                .filter((model) => model?.input_modalities?.includes("image"))
                .map((model) => ({
                    // The rich catalog names models with `name`; `/v1/models` uses `id`.
                    id: model.name ?? model.id,
                    title: model.title,
                    description: model.description,
                    context_length: model.context_length,
                    max_reference_images: model.max_reference_images,
                    supports_structured_output:
                        model.supports_structured_output,
                    paid_only: model.paid_only,
                }))
                .sort((a, b) => String(a.id).localeCompare(String(b.id)));
            return createMCPResponse([createTextContent(vision, true)]);
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
                "WWW-Authenticate": 'Bearer realm="vision-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "vision-mcp",
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
