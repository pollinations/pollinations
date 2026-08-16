import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";
import { getModels } from "../utils/models.js";

async function listModels(params, context) {
    const models = await getModels(
        params.type || "all",
        context,
        params.community,
    );
    return createMCPResponse([createTextContent(models, true)]);
}

async function getModelStatus(params, context) {
    const status = await fetchJsonWithAuth(
        buildUrl("/v1/models/status", { minutes: params.minutes }),
        {},
        context,
    );
    return createMCPResponse([createTextContent(status, true)]);
}

export const discoveryTools = [
    [
        "listModels",
        "Call before claiming that a named model is unavailable. Returns live canonical names, aliases, modalities, capabilities, voices, supported endpoints, and pricing in Pollen. Filter by modality or community ownership.",
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
        },
        listModels,
    ],
    [
        "getModelStatus",
        "Return recent per-model request counts, errors, and latency from GET /v1/models/status.",
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
