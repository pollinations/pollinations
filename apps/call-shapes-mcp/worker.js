import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";

const CHARS_PER_TOKEN = 4;

// The category catalogs carry what /v1/models leaves out: pricing units
// (per image or per megapixel), resolutions, voices and durations.
const CATEGORY_PATHS = {
    text: "/text/models",
    image: "/image/models",
    video: "/video/models",
    audio: "/audio/models",
    embedding: "/embeddings/models",
    "3d": "/3d/models",
};

// Endpoints to try per category, best first. Only endpoints the model
// advertises are used.
const CATEGORY_ENDPOINTS = {
    text: ["/v1/chat/completions", "/v1/responses", "/text", "/text/{prompt}"],
    image: ["/v1/images/generations", "/v1/images/edits", "/image/{prompt}"],
    video: ["/v1/images/generations", "/v1/responses", "/v1/chat/completions"],
    "3d": ["/v1/images/generations", "/v1/images/edits", "/image/{prompt}"],
    audio: ["/v1/audio/speech", "/v1/audio/transcriptions", "/audio/{text}"],
    embedding: ["/v1/embeddings"],
    realtime: ["/v1/realtime", "/realtime"],
};

// How a request body is built per endpoint.
const ENDPOINT_SHAPES = {
    "/v1/chat/completions": "chat",
    "/v1/responses": "responses",
    "/v1/images/generations": "image",
    "/v1/images/edits": "image",
    "/image/{prompt}": "image",
    "/v1/audio/speech": "speech",
    "/v1/audio/transcriptions": "transcription",
    "/v1/embeddings": "embeddings",
    "/text": "text",
    "/v1/realtime": "realtime",
};

function catalogEntries(catalog) {
    if (Array.isArray(catalog)) return catalog;
    if (Array.isArray(catalog?.data)) return catalog.data;
    return [];
}

function matches(model, query) {
    const wanted = query.trim().toLowerCase();
    if (!wanted) return false;
    const id = model.id?.toLowerCase();
    if (id === wanted) return true;
    // Agents often pass the bare model name, for example gpt-5.4-nano.
    if (id?.split("/").pop() === wanted) return true;
    if (model.name?.toLowerCase() === wanted) return true;
    return (model.aliases ?? []).some(
        (alias) => alias.toLowerCase() === wanted,
    );
}

function findModel(models, query) {
    const exact = models.find((model) => matches(model, query));
    if (exact) return exact;
    const needle = query.trim().toLowerCase();
    const partial = models
        .filter(
            (model) =>
                model.id?.toLowerCase().includes(needle) ||
                model.name?.toLowerCase().includes(needle) ||
                (model.aliases ?? []).some((alias) =>
                    alias.toLowerCase().includes(needle),
                ),
        )
        .slice(0, 5);
    return { ambiguous: partial.map((model) => model.id ?? model.name) };
}

function pricePerMillion(pricing, key) {
    const value = Number(pricing?.[key]);
    if (!Number.isFinite(value)) return null;
    return Number((value * 1_000_000).toFixed(4));
}

function supports(model, feature) {
    if (feature === "vision") {
        return (model.input_modalities ?? []).includes("image");
    }
    if (feature === "tools") {
        return (
            model.tools === true ||
            (model.capabilities ?? []).includes("tool_calling")
        );
    }
    if (feature === "reasoning") {
        return (
            model.reasoning === true ||
            (model.capabilities ?? []).includes("reasoning")
        );
    }
    if (feature === "json") {
        return (model.supported_parameters ?? []).includes("response_format");
    }
    if (feature === "streaming") {
        return (model.supported_parameters ?? []).includes("stream");
    }
    return false;
}

function pickEndpoint(model, needs) {
    const endpoints = model.supported_endpoints ?? [];
    const category = model.category ?? "text";
    const wanted = CATEGORY_ENDPOINTS[category] ?? CATEGORY_ENDPOINTS.text;
    // A text model with tools or reasoning needs the responses endpoint.
    if (
        category === "text" &&
        (needs.includes("tools") || needs.includes("reasoning")) &&
        endpoints.includes("/v1/responses")
    ) {
        return "/v1/responses";
    }
    return wanted.find((endpoint) => endpoints.includes(endpoint)) ?? null;
}

function buildBody(model, endpoint, options) {
    const parameters = model.supported_parameters ?? [];
    const body = { model: model.id ?? model.name };
    switch (ENDPOINT_SHAPES[endpoint]) {
        case "responses": {
            body.input = options.prompt;
            body.max_output_tokens = options.outputTokens;
            if (options.stream) body.stream = true;
            if (options.tools?.length) {
                body.tools = options.tools;
                body.tool_choice = "auto";
                body.parallel_tool_calls = true;
            }
            return body;
        }
        case "image": {
            body.prompt = options.prompt;
            body.n = 1;
            if (options.size) body.size = options.size;
            if (options.seed !== undefined) body.seed = options.seed;
            return body;
        }
        case "speech": {
            body.input = options.prompt;
            if (options.voice) body.voice = options.voice;
            return body;
        }
        case "transcription":
            // The endpoint takes a multipart upload, not a JSON body.
            return body;
        case "embeddings": {
            body.input = options.prompt;
            return body;
        }
        case "text": {
            body.prompt = options.prompt;
            return body;
        }
        case "realtime":
            return body;
        default: {
            body.messages = [{ role: "user", content: options.prompt }];
            if (options.stream && parameters.includes("stream"))
                body.stream = true;
            if (parameters.includes("max_completion_tokens")) {
                body.max_completion_tokens = options.outputTokens;
            } else if (parameters.includes("max_tokens")) {
                body.max_tokens = options.outputTokens;
            }
            if (options.tools && parameters.includes("tools")) {
                body.tools = options.tools;
                if (parameters.includes("tool_choice")) {
                    body.tool_choice = "auto";
                }
                if (parameters.includes("parallel_tool_calls")) {
                    body.parallel_tool_calls = true;
                }
            }
            if (options.json && parameters.includes("response_format")) {
                body.response_format = { type: "json_object" };
            }
            if (
                options.reasoningEffort &&
                parameters.includes("reasoning_effort")
            ) {
                body.reasoning_effort = options.reasoningEffort;
            }
            return body;
        }
    }
}

// Image models bill one flat rate per image; models that also price prompt
// tokens bill what the provider reports. Same rule as the CLI estimate.
function perImage(model) {
    return model.flat_rate ?? model.pricing?.promptTextTokens === undefined;
}

// The quantity each listed rate is billed on. A rate whose quantity is only
// known after the call stays unpriced instead of being guessed.
function quantityFor(model, field, quantities) {
    switch (field) {
        case "promptTextTokens":
            return quantities.promptTokens;
        case "completionTextTokens":
            return quantities.outputTokens;
        case "promptImageTokens":
            return quantities.inputImages;
        case "completionImageTokens": {
            if (model.pricing_units?.[field]?.unit === "megapixel") {
                return quantities.megapixels;
            }
            return perImage(model) ? quantities.images : null;
        }
        case "promptVideoSeconds":
        case "completionVideoSeconds":
        case "promptAudioSeconds":
        case "completionAudioSeconds":
            return quantities.seconds;
        case "promptCachedTokens":
        case "promptCacheWriteTokens":
            return 0;
        default:
            return null;
    }
}

function estimatedCost(model, quantities) {
    const pricing = model.pricing ?? {};
    const lines = [];
    const unpriced = [];
    for (const [field, value] of Object.entries(pricing)) {
        if (field === "currency") continue;
        const rate = Number(value);
        if (!Number.isFinite(rate)) continue;
        const declared = model.pricing_units?.[field];
        const unitRate = rate * (declared?.quantity ?? 1);
        const quantity = quantityFor(model, field, quantities);
        if (quantity === null) {
            unpriced.push(field);
            continue;
        }
        lines.push({
            field,
            rate: Number(unitRate.toFixed(10)),
            unit: declared?.unit ?? null,
            quantity,
            cost: Number((unitRate * quantity).toFixed(8)),
        });
    }
    const total = unpriced.length
        ? null
        : Number(lines.reduce((sum, line) => sum + line.cost, 0).toFixed(8));
    return {
        lines,
        unpriced,
        total_cost: total,
        currency: pricing.currency ?? "pollen",
    };
}

function notesFor(model, needs, options) {
    const notes = [];
    for (const feature of needs) {
        if (!supports(model, feature)) {
            notes.push(
                `This model does not support "${feature}". Pick another model or drop that requirement.`,
            );
        }
    }
    const health = model.health?.status;
    if (health && health !== "healthy") {
        notes.push(`Model health is "${health}".`);
    }
    if (model.community) {
        notes.push(
            "Community model: hosted by a third party, not Pollinations.",
        );
    }
    if (model.context_length && options.promptTokens > model.context_length) {
        notes.push(
            `Prompt of ~${options.promptTokens} tokens exceeds the context length of ${model.context_length}.`,
        );
    }
    if (options.stream && !supports(model, "streaming")) {
        notes.push("This model does not advertise streaming support.");
    }
    if (options.endpoint === "/v1/audio/transcriptions") {
        notes.push(
            "This endpoint takes a multipart upload with a file field, not a JSON body.",
        );
    }
    if (options.endpoint === "/v1/realtime") {
        notes.push(
            "Realtime models use a WebSocket session on this endpoint, not a plain request.",
        );
    }
    if (model.pricing_variants?.length) {
        notes.push(
            `Other rates apply for: ${model.pricing_variants.map((variant) => variant.label).join(", ")}.`,
        );
    }
    return notes;
}

// Cheaper models in the same category that cover the same needs.
function cheaperMatches(models, model, needs, quantities, limit = 3) {
    const price = estimatedCost(model, quantities).total_cost;
    if (price === null) return [];
    return models
        .filter((candidate) => {
            if ((candidate.id ?? candidate.name) === (model.id ?? model.name)) {
                return false;
            }
            if (candidate.category !== model.category) return false;
            return needs.every((feature) => supports(candidate, feature));
        })
        .map((candidate) => {
            const cost = estimatedCost(candidate, quantities).total_cost;
            return cost === null
                ? null
                : {
                      id: candidate.id ?? candidate.name,
                      total_cost: cost,
                      community: candidate.community === true,
                  };
        })
        .filter((candidate) => candidate && candidate.total_cost < price)
        .sort((a, b) => a.total_cost - b.total_cost)
        .slice(0, limit);
}

function reportFor(model) {
    return {
        id: model.id ?? model.name,
        title: model.title,
        description: model.description,
        aliases: model.aliases ?? [],
        publisher: model.publisher ?? model.owned_by,
        community: model.community === true,
        category: model.category,
        input_modalities: model.input_modalities ?? [],
        output_modalities: model.output_modalities ?? [],
        capabilities: model.capabilities ?? [],
        supported_endpoints: model.supported_endpoints ?? [],
        supported_parameters: model.supported_parameters ?? [],
        context_length: model.context_length ?? null,
        resolutions: model.resolutions ?? [],
        voices: model.voices ?? [],
        health: model.health ?? null,
        pricing: {
            currency: model.pricing?.currency ?? "pollen",
            prompt_per_million_tokens: pricePerMillion(
                model.pricing,
                "promptTextTokens",
            ),
            completion_per_million_tokens: pricePerMillion(
                model.pricing,
                "completionTextTokens",
            ),
        },
    };
}

// The category catalog knows the same model by its name and adds the fields
// /v1/models omits.
function enrich(model, categoryModels) {
    if (!categoryModels) return model;
    const match = categoryModels.find(
        (candidate) =>
            (candidate.name ?? candidate.id) === (model.id ?? model.name),
    );
    return match ? { ...model, ...match, id: model.id ?? match.name } : model;
}

function buildServer() {
    const server = new McpServer(
        { name: "call-shapes-mcp", title: "Call Shapes MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "plan_request",
        {
            description:
                "Plan a correct, cheap call to a Pollinations model. " +
                "Resolves a model id or alias, picks the endpoint the model " +
                "actually supports, returns a request body with only the " +
                "parameters that model accepts, the estimated Pollen cost, " +
                "warnings, and cheaper models that fit the same needs. " +
                "Model catalog lookups are free.",
            inputSchema: z.object({
                model: z
                    .string()
                    .describe("Model id or alias, for example gpt-5.4-nano."),
                task: z
                    .string()
                    .optional()
                    .describe("What the call should do, in one line."),
                needs: z
                    .array(
                        z.enum([
                            "vision",
                            "tools",
                            "reasoning",
                            "json",
                            "streaming",
                        ]),
                    )
                    .optional()
                    .describe("Capabilities the call must have."),
                prompt: z
                    .string()
                    .optional()
                    .describe("The prompt you plan to send."),
                promptChars: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("Length of the prompt in characters."),
                outputTokens: z
                    .number()
                    .int()
                    .positive()
                    .max(100000)
                    .optional()
                    .describe("Expected completion tokens."),
                seconds: z
                    .number()
                    .positive()
                    .optional()
                    .describe(
                        "Expected output length in seconds, for video and audio models.",
                    ),
                size: z
                    .string()
                    .optional()
                    .describe(
                        "Output size for image models, for example 1024x1024.",
                    ),
                voice: z
                    .string()
                    .optional()
                    .describe(
                        "Voice for speech models, from the model voice list.",
                    ),
                seed: z
                    .number()
                    .int()
                    .optional()
                    .describe("Seed for reproducible output."),
                reasoningEffort: z
                    .enum(["none", "minimal", "low", "medium", "high"])
                    .optional()
                    .describe("Requested reasoning depth."),
                tools: z
                    .array(
                        z
                            .object({
                                type: z.string(),
                                name: z.string(),
                            })
                            .loose(),
                    )
                    .optional()
                    .describe(
                        "Tool definitions you plan to send, in OpenAI tool schema shape.",
                    ),
            }),
        },
        async (
            {
                model: query,
                task,
                needs = [],
                prompt = "Your prompt",
                promptChars,
                outputTokens = 500,
                seconds,
                size,
                voice,
                seed,
                reasoningEffort,
                tools,
            },
            context,
        ) => {
            const catalog = await fetchJsonWithAuth(
                buildUrl("/v1/models"),
                {},
                context,
            );
            const models = catalogEntries(catalog);
            const found = findModel(models, query);
            if (found.ambiguous) {
                throw new Error(
                    `Unknown model "${query}".${
                        found.ambiguous.length
                            ? ` Close matches: ${found.ambiguous.join(", ")}.`
                            : ""
                    }`,
                );
            }
            const category = found.category ?? "text";
            let categoryModels = null;
            if (CATEGORY_PATHS[category]) {
                const categoryCatalog = await fetchJsonWithAuth(
                    buildUrl(CATEGORY_PATHS[category]),
                    {},
                    context,
                );
                categoryModels = catalogEntries(categoryCatalog);
            }
            const model = enrich(found, categoryModels);
            const endpoint = pickEndpoint(model, needs);
            if (!endpoint) {
                throw new Error(
                    `Model "${model.id ?? model.name}" advertises no supported endpoint for a request.`,
                );
            }
            const promptTokens = Math.max(
                1,
                Math.ceil((promptChars ?? prompt.length) / CHARS_PER_TOKEN),
            );
            const body = buildBody(model, endpoint, {
                prompt,
                outputTokens,
                stream: needs.includes("streaming"),
                tools: needs.includes("tools") ? (tools ?? []) : undefined,
                json: needs.includes("json"),
                reasoningEffort,
                size,
                voice,
                seed,
            });
            const megapixels = size
                ? (() => {
                      const [width, height] = size.split("x").map(Number);
                      return width && height
                          ? (width * height) / 1_000_000
                          : null;
                  })()
                : null;
            const quantities = {
                promptTokens,
                outputTokens,
                inputImages: 0,
                images: 1,
                seconds: seconds ?? model.default_duration ?? null,
                megapixels,
            };
            const cost = estimatedCost(model, quantities);
            const result = {
                model: model.id ?? model.name,
                task,
                endpoint,
                method:
                    ENDPOINT_SHAPES[endpoint] === "transcription"
                        ? "POST (multipart)"
                        : "POST",
                request_body: body,
                supported_endpoints: model.supported_endpoints ?? [],
                supported_parameters: model.supported_parameters ?? [],
                estimated_cost: cost,
                notes: [
                    ...notesFor(model, needs, {
                        promptTokens,
                        stream: needs.includes("streaming"),
                        endpoint,
                    }),
                    ...(cost.unpriced.length
                        ? [
                              `Billed by usage known only after generation (${cost.unpriced.join(", ")}).`,
                          ]
                        : []),
                ],
                cheaper_models_with_same_needs: cheaperMatches(
                    categoryModels ?? models,
                    model,
                    needs,
                    quantities,
                ),
            };
            return createMCPResponse([createTextContent(result, true)]);
        },
    );

    server.registerTool(
        "model_report",
        {
            description:
                "Full facts about one Pollinations model: price per million " +
                "tokens, modalities, capabilities, supported endpoints and " +
                "parameters, context length, and health. Free.",
            inputSchema: z.object({
                model: z
                    .string()
                    .describe("Model id or alias, for example gpt-5.4-nano."),
            }),
        },
        async ({ model: query }, context) => {
            const catalog = await fetchJsonWithAuth(
                buildUrl("/v1/models"),
                {},
                context,
            );
            const models = catalogEntries(catalog);
            const found = findModel(models, query);
            if (found.ambiguous) {
                throw new Error(
                    `Unknown model "${query}".${
                        found.ambiguous.length
                            ? ` Close matches: ${found.ambiguous.join(", ")}.`
                            : ""
                    }`,
                );
            }
            return createMCPResponse([
                createTextContent(reportFor(found), true),
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
                "WWW-Authenticate":
                    'Bearer realm="call-shapes-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "call-shapes-mcp",
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
