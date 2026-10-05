import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";
import { getModels } from "../utils/models.js";

async function listModels(params, context) {
    // Gen owns the filtering: visibility, API-key permissions, source,
    // reliability, the discovery filters and the result limit all run there.
    // This tool only forwards parameters and returns the live response, so no
    // search logic lives in the MCP.
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

export const discoveryTools = [
    [
        "listModels",
        "Call before claiming that a named model or agent is unavailable. Returns live canonical names, aliases, modalities, capabilities, voices, supported endpoints, agent status, and pricing in Pollen. Gen filters the catalog server-side, so narrow with query, capabilities, agent, community or limit instead of reading every model into context.",
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
            query: z
                .string()
                .optional()
                .describe(
                    "Case-insensitive search over canonical name, aliases, title, description and publisher; every whitespace-separated word must match",
                ),
            capabilities: z
                .array(
                    z.enum([
                        "tool_calling",
                        "reasoning",
                        "web_search",
                        "code_execution",
                        "pollinations_models",
                    ]),
                )
                .optional()
                .describe(
                    "Keep only models advertising every listed capability (AND semantics)",
                ),
            community: z
                .boolean()
                .optional()
                .describe(
                    "True for community models only, false for official models only",
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
                    "Maximum number of models returned; Gen applies it after every other filter",
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
