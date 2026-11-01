import { MCP_SERVERS } from "../../../../../shared/registry/mcp";
import type { Data } from "../types";
import { parseRevenueShareSources } from "./pipeContracts";

export const PRODUCT_STREAMS = [
    { key: "models", label: "Models", color: "#60a5fa" },
    { key: "byop", label: "BYOP apps", color: "#2dd4bf" },
    { key: "community", label: "Community models", color: "#c084fc" },
] as const;
export type ProductStream = (typeof PRODUCT_STREAMS)[number]["key"];
export type ProductValue = { consumed: number; retained: number };
export type ProductMixMonth = {
    month: string;
    streams: Record<ProductStream, ProductValue> | null;
};
const TOOL_MODELS = new Set<string>(
    MCP_SERVERS.filter((server) => server.billing === "usage_receipt").map(
        (server) => server.id,
    ),
);
const near = (a: number, b: number) => Math.abs(a - b) <= 0.01;

export function monthlyProductMix(
    data: Data,
    months: string[],
    funding: "paid" | "quest" = "paid",
): ProductMixMonth[] {
    const pollenFunding = funding === "paid" ? "paid" : "quests";
    return months.map((month) => {
        const pollen =
            data.opPollen?.filter((row) => row.month === month) ?? [];
        const missing: ProductMixMonth = { month, streams: null };
        if (!pollen.length || !data.revenueShare) return missing;
        const sources = data.revenueShare.filter(
            (row) => row.month === month && row.row_type === "source",
        );
        const apps = sources.filter((row) =>
            parseRevenueShareSources(row.sources_json).some(
                (source) => source.type === "app",
            ),
        );
        const modelSources = sources.filter((row) =>
            parseRevenueShareSources(row.sources_json).some(
                (source) => source.type === "model",
            ),
        );
        const sum = <T>(rows: T[], value: (row: T) => number) =>
            rows.reduce((total, row) => total + value(row), 0);
        // Never infer absent app attribution or ownership from a model name.
        if (
            !near(
                sum(apps, (r) => r[`${funding}_creator_earnings`]),
                sum(pollen, (r) => r[`byop_${pollenFunding}`]),
            ) ||
            !near(
                sum(modelSources, (r) => r[`${funding}_creator_earnings`]),
                sum(pollen, (r) => r[`model_${pollenFunding}`]),
            )
        )
            return missing;
        // Tooling gets its own stream when it launches; don't relabel its usage as Models.
        const models = pollen.filter((row) => !TOOL_MODELS.has(row.model));
        const appModels = apps.filter((row) => {
            const attributed = parseRevenueShareSources(
                row.sources_json,
            ).flatMap((source) => source.models);
            return attributed.every((model) => !TOOL_MODELS.has(model));
        });
        if (
            apps.some((row) => {
                const attributed = parseRevenueShareSources(
                    row.sources_json,
                ).flatMap((source) => source.models);
                return (
                    attributed.some((model) => TOOL_MODELS.has(model)) &&
                    attributed.some((model) => !TOOL_MODELS.has(model))
                );
            })
        )
            return missing;
        const total = sum(models, (r) => r[`price_${pollenFunding}`]);
        const community = sum(
            models.filter((r) => r.vendor === "community"),
            (r) => r[`price_${pollenFunding}`],
        );
        const appUsed = sum(appModels, (r) => r[`${funding}_usage`]);
        const appCommunity = sum(
            appModels,
            (r) => r[`${funding}_community_usage`],
        );
        const appOwners = sum(
            appModels,
            (r) => r[`${funding}_creator_earnings`],
        );
        const appModelOwners = sum(
            appModels,
            (r) => r[`${funding}_model_creator_earnings`],
        );
        const directModels = total - community - appUsed + appCommunity;
        const directCommunity = community - appCommunity;
        const streams = {
            models: { consumed: directModels, retained: directModels },
            byop: {
                consumed: appUsed,
                retained: appUsed - appOwners - appModelOwners,
            },
            community: {
                consumed: directCommunity,
                retained:
                    directCommunity -
                    sum(models, (r) => r[`model_${pollenFunding}`]) +
                    appModelOwners,
            },
        };
        const values = Object.values(streams).flatMap((s) => [
            s.consumed,
            s.retained,
        ]);
        if (values.some((value) => !Number.isFinite(value) || value < -0.01))
            return missing;
        return { month, streams };
    });
}
