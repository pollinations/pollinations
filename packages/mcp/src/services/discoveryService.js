import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";
import { getModels } from "../utils/models.js";

// The MCP listModels tool is a thin proxy: it validates and forwards filters
// to the Gen model-list API and returns the live response unchanged. Gen
// performs all filtering (visibility, permissions, query, capabilities,
// agent, reliability, limit), so this service never maintains its own search
// logic or a local model list.
async function listModels(params, context) {
    const { type, ...filters } = params;
    const models = await getModels(type || "all", context, filters);
    return createMCPResponse([createTextContent(models, true)]);
}

async function getModelStatus(params, context) {
    const status = await fetchJsonWithAuth(
        buildUrl("/models/status", { minutes: params.minutes }),
        {},
        context,
    );
    return createMCPResponse([createTextContent(status, true)]);
}

const MODEL_CAPABILITIES = [
    "tool_calling",
    "reasoning",
    "web_search",
    "code_execution",
    "pollinations_models",
];

export const discoveryTools = [
    [
        "listModels",
        "Call before claiming that a named model or agent is unavailable. Returns live canonical names, aliases, modalities, capabilities, voices, supported endpoints, agent status, and pricing in Pollen. Forwards optional query, capabilities, agent, limit, community, and type filters to the Gen model-list API, which performs the filtering; the response is returned unchanged.",
        {
            type: z
                .enum([
                    "all",
                    "text",
                    "image",
                    "video",
                    "audio",
                    "embedding",
                    "3d",
                ])
                .optional()
                .describe("Model type (default: all)"),
            community: z
                .boolean()
                .optional()
                .describe(
                    "True for community models only, false for official models only",
                ),
            query: z
                .string()
                .max(200)
                .optional()
                .describe(
                    "Case-insensitive search across canonical name, aliases, title, description, and publisher; whitespace-separated tokens must all match (AND)",
                ),
            capabilities: z
                .array(z.enum(MODEL_CAPABILITIES))
                .max(10)
                .optional()
                .describe(
                    "Every listed capability must be present on the model (AND semantics)",
                ),
            agent: z
                .boolean()
                .optional()
                .describe("True for agents only, false to exclude agents"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(500)
                .optional()
                .describe(
                    "Maximum number of models returned; applied server-side after visibility, permissions, source, and reliability filters",
                ),
        },
        listModels,
    ],
    [
        "getModelStatus",
        "Return recent per-model and per-route request counts, errors, fallback rescues, and latency from GET /models/status.",
        {
            minutes: z
                .number()
                .int()
                .min(1)
                .max(10080)
                .optional()
                .describe("Rolling window in minutes (default: 60)"),
        },
        getModelStatus,
    ],
];
