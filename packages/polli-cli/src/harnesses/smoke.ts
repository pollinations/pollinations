import { gen } from "../lib/api.js";

interface UsageRecord {
    timestamp?: string;
    model?: string;
    api_key_id?: string | null;
    input_text_tokens?: number | null;
    output_text_tokens?: number | null;
    cost_usd?: number | null;
}

interface UsageResponse {
    usage?: UsageRecord[];
}

const usageFingerprint = (record: UsageRecord) =>
    JSON.stringify([
        record.timestamp,
        record.model,
        record.api_key_id,
        record.input_text_tokens,
        record.output_text_tokens,
        record.cost_usd,
    ]);

const usageForModel = async (apiKey: string, model: string) => {
    const params = new URLSearchParams({ limit: "100", models: model });
    const response = await gen<UsageResponse>(`/account/usage?${params}`, {
        apiKey,
    });
    return response.usage ?? [];
};

const delay = (milliseconds: number) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Run live router checks, then prove that metering landed under the dedicated
 * key. The key is used only as the account/usage credential and is never
 * returned, printed, or copied to another config.
 */
export const verifyHarnessSmoke = async (
    apiKey: string,
    model: string,
    checks: () => Promise<void>,
) => {
    const before = new Set(
        (await usageForModel(apiKey, model)).map(usageFingerprint),
    );
    await checks();

    for (let attempt = 0; attempt < 10; attempt++) {
        const current = await usageForModel(apiKey, model);
        if (current.some((record) => !before.has(usageFingerprint(record)))) {
            return true;
        }
        if (attempt < 9) await delay(1_000);
    }
    throw new Error(
        `The router checks passed, but no new Pollinations usage record appeared for ${model}.`,
    );
};

export const responseError = async (response: Response) => {
    const text = await response.text().catch(() => "");
    return `${response.status} ${response.statusText}${text ? `: ${text.slice(0, 500)}` : ""}`;
};
