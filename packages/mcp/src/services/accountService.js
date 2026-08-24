import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

async function proxyAccount(path, params, context) {
    requireApiKey(context);
    return createMCPResponse([
        createTextContent(
            await fetchJsonWithAuth(buildUrl(path, params), {}, context),
            true,
        ),
    ]);
}

export const accountTools = [
    [
        "getBalance",
        "Return the raw balance response for the authenticated API key.",
        z.object({}),
        (params, context) => proxyAccount("/account/balance", params, context),
    ],
    [
        "getUsage",
        "Return raw usage history for the authenticated API key.",
        z
            .object({
                days: z.number().int().optional(),
                limit: z.number().int().optional(),
            })
            .passthrough(),
        (params, context) =>
            proxyAccount("/account/key/usage", params, context),
    ],
];
