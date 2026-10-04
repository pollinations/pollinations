import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";
import { getModels } from "../utils/models.js";

// Thin proxy: every discovery filter is forwarded to Gen and the live
// response is returned untouched, so search logic never lives in the MCP.
async function listModels(params, context) {
    const models = await getModels(
        params.type || "all",
        context,
        params.community,
        {
            query: params.query,
            capabilities: params.capabilities,
            agent:
                params.agent === undefined ? undefined : String(params.agent),
            limit: params.limit,
        },
    );
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
        "Call before claiming that a named model or agent is unavailable. Returns live canonical names, aliases, modalities, capabilities, voices, supported endpoints, agent status, and pricing in Pollen. Filter by modality, community ownership, agents, text search, capabilities, or a result limit so a narrow subset comes back instead of the full catalog.",
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
                    "Case-insensitive text search over canonical name, aliases, title, description and publisher; every word must match",
                ),
            capabilities: z
                .string()
                .optional()
                .describe(
                    "Comma- or pipe-separated capabilities that must ALL be present (AND), e.g. `tool_calling,reasoning`",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe(
                    "Return at most this many models after all other filters",
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
