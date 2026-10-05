import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";
import { getModels } from "../utils/models.js";

async function listModels(params, context) {
    // Gen filters the catalog, including `agent`, so the MCP stays a thin
    // proxy: forward everything and return the live response untouched.
    const models = await getModels(params.type || "all", context, {
        community: params.community,
        agent: params.agent,
        query: params.query,
        capabilities: params.capabilities,
        limit: params.limit,
    });
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
        "Call before claiming that a named model or agent is unavailable. Returns live canonical names, aliases, modalities, capabilities, voices, supported endpoints, agent status, and pricing in Pollen. Filter by modality, community ownership, or agents, search the catalog with `query` and `capabilities`, and keep `limit` small so a filtered subset reaches your context instead of the whole catalog.",
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
            agent: z
                .boolean()
                .optional()
                .describe("True for agents only, false to exclude agents"),
            query: z
                .string()
                .optional()
                .describe(
                    "Search model name, aliases, title, description and publisher; case-insensitive and returns only matching models",
                ),
            capabilities: z
                .string()
                .optional()
                .describe(
                    "Capabilities every result must have, comma-separated: tool_calling, reasoning, web_search, code_execution, pollinations_models",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(500)
                .optional()
                .describe(
                    "Maximum number of models to return; applied to the filtered catalog, so use it after the other filters",
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
