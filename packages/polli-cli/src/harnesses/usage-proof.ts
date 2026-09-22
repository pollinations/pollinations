import { gen } from "../lib/api.js";
import { resolveApiKey } from "../lib/config.js";

interface KeyUsageResponse {
    usage: unknown[];
    count: number;
}

interface AccountKeyRow {
    start: string;
    lastRequest: string | null;
    enabled: boolean;
}

interface AccountKeysResponse {
    data: AccountKeyRow[];
}

export const keyUsageCount = async (apiKey: string): Promise<number> => {
    const result = await gen<KeyUsageResponse>("/account/key/usage?limit=1", {
        apiKey,
    });
    return Number(result.count ?? result.usage?.length ?? 0);
};

const accountLastRequest = async (apiKey: string): Promise<number | null> => {
    const accountKey = resolveApiKey();
    if (!accountKey || accountKey === apiKey) return null;
    try {
        const result = await gen<AccountKeysResponse>("/account/keys", {
            apiKey: accountKey,
        });
        const row = result.data?.find(
            (item) =>
                item.enabled !== false &&
                Boolean(item.start) &&
                apiKey.startsWith(item.start),
        );
        return row?.lastRequest ? Date.parse(row.lastRequest) : null;
    } catch {
        return null;
    }
};

export const waitForKeyUsageIncrease = async (
    apiKey: string,
    before: number,
    options: { attempts?: number; delayMs?: number; afterMs?: number } = {},
): Promise<number> => {
    const attempts = options.attempts ?? 30;
    const delayMs = options.delayMs ?? 1000;
    const afterMs = options.afterMs ?? Date.now();

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const count = await keyUsageCount(apiKey);
        if (count > before) return count;

        // Account usage rows can lag behind the API-key record itself.
        // When the Polli account session is available, lastRequest is an
        // immediate server-side proof that this exact child key was used.
        const lastRequest = await accountLastRequest(apiKey);
        if (
            lastRequest !== null &&
            Number.isFinite(lastRequest) &&
            lastRequest >= afterMs - 5000
        ) {
            return before + 1;
        }

        if (attempt + 1 < attempts) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    throw new Error(
        "Router smoke test returned, but no request appeared for the dedicated Pollinations key.",
    );
};
