import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";

const CHARS_PER_TOKEN = 4;

function catalogEntries(catalog) {
    if (Array.isArray(catalog)) return catalog;
    if (Array.isArray(catalog?.data)) return catalog.data;
    return [];
}

function matches(model, query) {
    const wanted = query.trim().toLowerCase();
    if (!wanted) return false;
    if (model.id?.toLowerCase() === wanted) return true;
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
                (model.aliases ?? []).some((alias) =>
                    alias.toLowerCase().includes(needle),
                ),
        )
        .slice(0, 5);
    return { ambiguous: partial.map((model) => model.id) };
}

function pricePerMillion(pricing, key) {
    const value = Number(pricing?.[key]);
    if (!Number.isFinite(value)) return null;
    return Number((value * 1_000_000).toFixed(4));
}

function estimatedCost(model, promptChars, outputTokens) {
    const promptTokens = Math.max(1, Math.ceil(promptChars / CHARS_PER_TOKEN));
    const promptPrice = Number(model.pricing?.promptTextTokens);
    const completionPrice = Number(model.pricing?.completionTextTokens);
    if (!Number.isFinite(promptPrice) || !Number.isFinite(completionPrice)) {
        return null;
    }
    const prompt = promptTokens * promptPrice;
    const completion = outputTokens * completionPrice;
    return {
        prompt_tokens: promptTokens,
        output_tokens: outputTokens,
        prompt_cost: Number(prompt.toFixed(8)),
        completion_cost: Number(completion.toFixed(8)),
        total_cost: Number((prompt + completion).toFixed(8)),
        currency: model.pricing?.currency ?? "pollen",
    };
}

function supports(model, feature) {
    if (feature === "vision") {
        return (model.input_modalities ?? []).includes("image");
    }
    if (feature === "tools") {
        return (
            model.tools === true ||
            (model.capabilities ?? []).includes("tool_calling") ||
            (model.supported_parameters ?? []).includes("tools")
        );
    }
    if (feature === "reasoning") {
        return (
            model.reasoning === true ||
            (model.capabilities ?? []).includes("reasoning") ||
            (model.supported_parameters ?? []).includes("reasoning_effort")
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
    const wantsTools = needs.includes("tools");
    const wantsReasoning = needs.includes("reasoning");
    if ((wantsTools || wantsReasoning) && endpoints.includes("/v1/responses")) {
        return "/v1/responses";
    }
    if (endpoints.includes("/v1/chat/completions")) {
        return "/v1/chat/completions";
    }
    if (endpoints.includes("/v1/responses")) return "/v1/responses";
    if (endpoints.includes("/text")) return "/text";
    return null;
}

function buildBody(model, endpoint, options) {
    const parameters = model.supported_parameters ?? [];
    const body = { model: model.id };
    if (endpoint === "/v1/responses") {
        body.input = options.prompt;
    } else {
        body.messages = [{ role: "user", content: options.prompt }];
    }
    if (options.stream && parameters.includes("stream")) body.stream = true;
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
    if (options.reasoningEffort && parameters.includes("reasoning_effort")) {
        body.reasoning_effort = options.reasoningEffort;
    }
    return body;
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
    return notes;
}

function cheaperMatches(models, model, needs, limit = 3) {
    const price =
        Number(model.pricing?.promptTextTokens) +
        Number(model.pricing?.completionTextTokens);
    if (!Number.isFinite(price)) return [];
    return models
        .filter((candidate) => {
            if (candidate.id === model.id) return false;
            if (candidate.category !== "text") return false;
            if (
                (candidate.output_modalities ?? []).includes("text") === false
            ) {
                return false;
            }
            return needs.every((feature) => supports(candidate, feature));
        })
        .map((candidate) => ({
            id: candidate.id,
            total_price: Number(
                (
                    Number(candidate.pricing?.promptTextTokens) +
                    Number(candidate.pricing?.completionTextTokens)
                ).toFixed(8),
            ),
            community: candidate.community === true,
        }))
        .filter((candidate) => Number.isFinite(candidate.total_price))
        .filter((candidate) => candidate.total_price < price)
        .sort((a, b) => a.total_price - b.total_price)
        .slice(0, limit);
}

function reportFor(model) {
    return {
        id: model.id,
        title: model.title,
        description: model.description,
        aliases: model.aliases ?? [],
        publisher: model.owned_by,
        community: model.community === true,
        category: model.category,
        input_modalities: model.input_modalities ?? [],
        output_modalities: model.output_modalities ?? [],
        capabilities: model.capabilities ?? [],
        supported_endpoints: model.supported_endpoints ?? [],
        supported_parameters: model.supported_parameters ?? [],
        context_length: model.context_length ?? null,
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
            const endpoint = pickEndpoint(found, needs);
            if (!endpoint) {
                throw new Error(
                    `Model "${found.id}" advertises no supported generation endpoint.`,
                );
            }
            const promptTokens = Math.max(
                1,
                Math.ceil((promptChars ?? prompt.length) / CHARS_PER_TOKEN),
            );
            const body = buildBody(found, endpoint, {
                prompt,
                outputTokens,
                stream: needs.includes("streaming"),
                tools: needs.includes("tools") ? (tools ?? []) : undefined,
                json: needs.includes("json"),
                reasoningEffort,
            });
            const result = {
                model: found.id,
                task,
                endpoint,
                method: "POST",
                request_body: body,
                supported_endpoints: found.supported_endpoints ?? [],
                supported_parameters: found.supported_parameters ?? [],
                estimated_cost: estimatedCost(
                    found,
                    promptChars ?? prompt.length,
                    outputTokens,
                ),
                notes: notesFor(found, needs, {
                    promptTokens,
                    stream: needs.includes("streaming"),
                }),
                cheaper_models_with_same_needs: cheaperMatches(
                    models,
                    found,
                    needs,
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
