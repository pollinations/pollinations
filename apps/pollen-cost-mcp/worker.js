import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";

const CATEGORIES = ["text", "image", "audio", "embedding", "realtime"];

const UsageSchema = z
    .object({
        prompt_text_tokens: z.number().nonnegative().optional(),
        prompt_cached_text_tokens: z.number().nonnegative().optional(),
        completion_text_tokens: z.number().nonnegative().optional(),
        completion_reasoning_tokens: z.number().nonnegative().optional(),
        prompt_image_tokens: z.number().nonnegative().optional(),
        completion_image_tokens: z.number().nonnegative().optional(),
        images: z
            .number()
            .int()
            .nonnegative()
            .optional()
            .describe(
                "Number of images to generate. Multiplies the model's per-image rate.",
            ),
        prompt_audio_tokens: z.number().nonnegative().optional(),
        completion_audio_tokens: z.number().nonnegative().optional(),
        prompt_audio_seconds: z.number().nonnegative().optional(),
    })
    .strict();

const USAGE_FIELD_TO_PRICING_KEY = {
    prompt_text_tokens: "promptTextTokens",
    prompt_cached_text_tokens: "promptCachedTokens",
    completion_text_tokens: "completionTextTokens",
    completion_reasoning_tokens: "completionReasoningTokens",
    prompt_image_tokens: "promptImageTokens",
    completion_image_tokens: "completionImageTokens",
    images: "completionImageTokens",
    prompt_audio_tokens: "promptAudioTokens",
    completion_audio_tokens: "completionAudioTokens",
    prompt_audio_seconds: "promptAudioSeconds",
};

function round(value) {
    return Number(value.toFixed(12));
}

function numberOrUndefined(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

async function fetchCatalog(context) {
    const response = await fetchJsonWithAuth(
        buildUrl("/v1/models", { reliability: "all" }),
        {},
        context,
    );
    if (!Array.isArray(response?.data)) {
        throw new Error("The model catalog returned an unexpected shape.");
    }
    return response.data;
}

function findModel(catalog, requested) {
    const needle = requested.trim().toLowerCase();
    return catalog.find(
        (model) =>
            model.id?.toLowerCase() === needle ||
            (model.aliases ?? []).some(
                (alias) => alias.toLowerCase() === needle,
            ),
    );
}

function buildUsage(input) {
    const usage = {};
    for (const [field, pricingKey] of Object.entries(
        USAGE_FIELD_TO_PRICING_KEY,
    )) {
        const quantity = input[field];
        if (quantity === undefined) continue;
        usage[pricingKey] = (usage[pricingKey] ?? 0) + quantity;
    }
    if (input.prompt_text !== undefined) {
        // Roughly four characters per token; good enough to compare models.
        usage.promptTextTokens =
            (usage.promptTextTokens ?? 0) +
            Math.ceil(input.prompt_text.length / 4);
    }
    return usage;
}

function estimate(model, usage) {
    const pricing = model.pricing ?? {};
    const breakdown = {};
    let total = 0;
    let pricedQuantities = 0;

    for (const [key, quantity] of Object.entries(usage)) {
        const rate = numberOrUndefined(pricing[key]);
        if (rate === undefined) continue;
        pricedQuantities += 1;
        const cost = quantity * rate;
        breakdown[key] = { quantity, rate, cost: round(cost) };
        total += cost;
    }

    return {
        model: model.id,
        title: model.title,
        category: model.category,
        currency: pricing.currency ?? "pollen",
        breakdown,
        totalCost: round(total),
        unpricedUsage:
            pricedQuantities === 0
                ? "This model lists no rate for the requested usage."
                : undefined,
    };
}

function summarize(model) {
    return {
        id: model.id,
        title: model.title,
        category: model.category,
        aliases: model.aliases ?? [],
        capabilities: model.capabilities ?? [],
        context_length: model.context_length,
        paid_only: Boolean(model.paid_only),
        health: model.health?.status,
        pricing: Object.fromEntries(
            Object.entries(model.pricing ?? {})
                .filter(([key]) => key !== "currency")
                .map(([key, value]) => [key, numberOrUndefined(value)])
                .filter(([, value]) => value !== undefined),
        ),
    };
}

function filterModels(catalog, filters) {
    return catalog.filter((model) => {
        if (filters.category && model.category !== filters.category) {
            return false;
        }
        if (filters.capability) {
            const capabilities = model.capabilities ?? [];
            if (!capabilities.includes(filters.capability)) return false;
        }
        if (filters.paid_only !== undefined) {
            if (Boolean(model.paid_only) !== filters.paid_only) return false;
        }
        if (
            filters.min_context_length !== undefined &&
            (model.context_length ?? 0) < filters.min_context_length
        ) {
            return false;
        }
        if (
            filters.include_unhealthy !== true &&
            model.health?.status === "unhealthy"
        ) {
            return false;
        }
        return true;
    });
}

function buildServer() {
    const server = new McpServer(
        { name: "pollen-cost-mcp", title: "Pollen Cost MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "list_models",
        {
            description:
                "List models from the live Pollinations catalog with their Pollen rates, " +
                "capabilities, context length and health. Filter by category before choosing a model.",
            inputSchema: {
                category: z.enum(CATEGORIES).optional(),
                capability: z
                    .string()
                    .optional()
                    .describe(
                        'Require a capability such as "tool_calling" or "reasoning".',
                    ),
                paid_only: z.boolean().optional(),
                min_context_length: z.number().int().nonnegative().optional(),
                include_unhealthy: z.boolean().optional(),
                limit: z.number().int().min(1).max(50).optional(),
            },
        },
        async (
            {
                category,
                capability,
                paid_only,
                min_context_length,
                include_unhealthy,
                limit = 20,
            },
            context,
        ) => {
            const catalog = await fetchCatalog(context);
            const models = filterModels(catalog, {
                category,
                capability,
                paid_only,
                min_context_length,
                include_unhealthy,
            });
            return createMCPResponse([
                createTextContent(
                    {
                        total: models.length,
                        returned: Math.min(models.length, limit),
                        models: models.slice(0, limit).map(summarize),
                    },
                    true,
                ),
            ]);
        },
    );

    server.registerTool(
        "estimate_cost",
        {
            description:
                "Estimate the Pollen cost of one request before running it. " +
                "Pass token or unit counts matching the model's category; use images for image output. " +
                "prompt_text is a convenience and is charged at roughly four characters per token.",
            inputSchema: {
                model: z
                    .string()
                    .describe(
                        "Model id or alias, for example openai/gpt-5.4-nano.",
                    ),
                usage: UsageSchema,
                prompt_text: z
                    .string()
                    .optional()
                    .describe(
                        "Raw prompt text, approximated to tokens instead of prompt_text_tokens.",
                    ),
            },
        },
        async ({ model, usage, prompt_text }, context) => {
            const catalog = await fetchCatalog(context);
            const match = findModel(catalog, model);
            if (!match) {
                throw new Error(
                    `Unknown model "${model}". Use list_models to see available ids.`,
                );
            }
            return createMCPResponse([
                createTextContent(
                    estimate(match, buildUsage({ ...usage, prompt_text })),
                    true,
                ),
            ]);
        },
    );

    server.registerTool(
        "cheapest_models",
        {
            description:
                "Rank models of a category by the estimated Pollen cost of the same request, " +
                "cheapest first. Respects required capabilities and a minimum context length, " +
                "so the answer is the cheapest model that can still do the job.",
            inputSchema: {
                category: z.enum(CATEGORIES),
                usage: UsageSchema,
                prompt_text: z.string().optional(),
                required_capabilities: z.array(z.string()).optional(),
                min_context_length: z.number().int().nonnegative().optional(),
                include_paid_only: z.boolean().optional(),
                include_unhealthy: z.boolean().optional(),
                limit: z.number().int().min(1).max(20).optional(),
            },
        },
        async (
            {
                category,
                usage,
                prompt_text,
                required_capabilities = [],
                min_context_length,
                include_paid_only = true,
                include_unhealthy,
                limit = 5,
            },
            context,
        ) => {
            const catalog = await fetchCatalog(context);
            const pricedUsage = buildUsage({ ...usage, prompt_text });
            const candidates = filterModels(catalog, {
                category,
                min_context_length,
                include_unhealthy,
            }).filter((model) => {
                if (!include_paid_only && model.paid_only) return false;
                const capabilities = model.capabilities ?? [];
                return required_capabilities.every((required) =>
                    capabilities.includes(required),
                );
            });

            const ranked = candidates
                .map((model) => estimate(model, pricedUsage))
                .filter(
                    (result) =>
                        result.totalCost > 0 ||
                        Object.keys(result.breakdown).length > 0,
                )
                .sort(
                    (left, right) =>
                        left.totalCost - right.totalCost ||
                        left.model.localeCompare(right.model),
                );

            return createMCPResponse([
                createTextContent(
                    {
                        category,
                        usage: pricedUsage,
                        considered: candidates.length,
                        models: ranked.slice(0, limit),
                    },
                    true,
                ),
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
                    'Bearer realm="pollen-cost-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "pollen-cost-mcp",
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
