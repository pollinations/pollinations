import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../utils/coreUtils.js";

async function getBalance(_params, context) {
    requireApiKey(context);
    const data = await fetchJsonWithAuth(
        buildUrl("/account/balance"),
        {},
        context,
    );
    return createMCPResponse([
        createTextContent(
            {
                pollen: data.balance,
                note: "Pollen balance for the authenticated key. Key-scoped when the key has its own budget, otherwise account-wide.",
            },
            true,
        ),
    ]);
}

export const accountTools = [
    [
        "getBalance",
        "Get the current Pollen balance for the authenticated API key. " +
            "Returns key-scoped balance if the key has its own budget, otherwise account-wide. " +
            "Requires an API key with 'account:usage' permission.",
        {},
        getBalance,
    ],
];
