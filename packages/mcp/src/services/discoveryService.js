import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

async function getModelStatus(params, context) {
    return createMCPResponse([
        createTextContent(
            await fetchJsonWithAuth(
                buildUrl("/v1/models/status", params),
                {},
                context,
            ),
            true,
        ),
    ]);
}

export const discoveryTools = [
    [
        "getModelStatus",
        "Return the raw recent model request, error, and latency status from Gen.",
        z.object({ minutes: z.number().int().optional() }).passthrough(),
        getModelStatus,
    ],
];
