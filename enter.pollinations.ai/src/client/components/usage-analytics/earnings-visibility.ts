import type { ApiKey } from "../api-keys/types.ts";

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

export function shouldShowEarningsGraph({
    appCount,
    totalPollen,
    error,
}: {
    appCount: number;
    totalPollen: number;
    error: string | null;
}): boolean {
    return appCount > 0 && (totalPollen > 0 || error !== null);
}
