import type { ApiKey } from "../keys/types.ts";

export type EarningsApp = {
    id: string;
    name: string;
};

export function getEarningsEnabledApps(apiKeys: ApiKey[]): EarningsApp[] {
    return apiKeys
        .filter(
            (key): key is ApiKey & { name: string } =>
                typeof key.name === "string" &&
                key.name.length > 0 &&
                key.metadata?.keyType === "publishable",
        )
        .map((key) => ({ id: key.id, name: key.name }));
}
