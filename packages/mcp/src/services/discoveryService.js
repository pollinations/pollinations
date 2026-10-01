import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";
import { getModels } from "../utils/models.js";

async function listModels(params, context) {
    // Thin proxy: Gen applies query/capabilities/agent/limit/community
    // filters; the MCP forwards them and returns the live response as-is.
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
        "Call before claiming that a named model or agent is unavailable. Returns live canonical names, aliases, modalities, capabilities, voices, supported endpoints, agent status, and pricing in Pollen. Search catalog text with query, narrow with capabilities (AND), agent, community, and limit instead of fetching the full catalog.",
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
                    "Case-insensitive search over canonical name, aliases, title, description, and publisher; whitespace-separated tokens must all match",
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
                    "Models must have every listed capability (AND semantics)",
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
                    "Maximum number of models returned (1-500), preserving catalog order",
                ),
            community: z
                .boolean()
                .optional()
                .describe(
                    "True for community models only, false for official models only",
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
