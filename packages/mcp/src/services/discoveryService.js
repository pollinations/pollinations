import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";
import { getModels } from "../utils/models.js";

async function listModels(params, context) {
    const models = await getModels(params.type || "all", context, {
        community: params.community,
        query: params.query,
        capabilities: params.capabilities,
        agent: params.agent,
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
        "Call before claiming that a named model or agent is unavailable. Returns live canonical names, aliases, modalities, capabilities, voices, supported endpoints, agent status, and pricing in Pollen. Narrow the catalog by modality, community ownership, agent status, text search, capabilities, or a result limit instead of loading every model.",
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
                    "Case-insensitive search over canonical name, aliases, title, description and publisher; every word must appear",
                ),
            capabilities: z
                .array(z.string())
                .optional()
                .describe(
                    "Only models listing every capability, e.g. tool_calling, reasoning, web_search, code_execution, pollinations_models",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(500)
                .optional()
                .describe("Return at most this many models, applied last"),
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
