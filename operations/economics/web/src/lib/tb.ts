import { FIXTURES } from "../fixtures";
import type {
    Data,
    EconomicsPrivateConfigRow,
    OpCloudRow,
    OpPollenRow,
    OpTransactionRow,
    RevenueShareSourceRow,
    StripeSalesRow,
    UserBalanceSummaryRow,
} from "../types";
import { parsePrivateConfig, validatePipeRows } from "./pipeContracts";
import {
    canonicalProvider,
    collectProviderObservations,
    pollenVendorOverride,
} from "./providerRegistry";

export { validatePipeRows } from "./pipeContracts";

export const fixturesMode = (): boolean =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("fixtures");

export class TbError extends Error {
    pipe: string;
    status: number;

    constructor(pipe: string, status: number) {
        super(`${pipe}: HTTP ${status}`);
        this.pipe = pipe;
        this.status = status;
    }
}

async function fetchPipe<T>(pipe: string, signal?: AbortSignal): Promise<T[]> {
    if (fixturesMode()) {
        const rows = FIXTURES[pipe];
        if (!rows) throw new Error(`Missing fixture for pipe ${pipe}`);
        return validatePipeRows<T>(pipe, rows);
    }

    const res = await fetch(`/api/pipes/${encodeURIComponent(pipe)}`, {
        signal,
    });
    if (!res.ok) throw new TbError(pipe, res.status);

    const body = (await res.json()) as { data?: unknown[] };
    if (!Array.isArray(body.data)) {
        throw new Error(`${pipe}: response has no data array`);
    }
    return validatePipeRows<T>(pipe, body.data);
}

export function canonicalVendor(vendor: string): string {
    return canonicalProvider(vendor);
}

const POLLEN_VALUE_FIELDS = [
    "cost_paid",
    "cost_quests",
    "price_paid",
    "price_quests",
    "byop_paid",
    "byop_quests",
    "model_paid",
    "model_quests",
    "requests_paid",
    "requests_quests",
] as const satisfies readonly (keyof OpPollenRow)[];

function pollenKey(row: OpPollenRow): string {
    return [row.month, row.vendor, row.model, row.currency].join("|");
}

export function canonicalPollenRows(
    rows: readonly OpPollenRow[],
): OpPollenRow[] {
    const aggregated = new Map<string, OpPollenRow>();

    for (const sourceRow of rows) {
        const vendor = canonicalVendor(sourceRow.vendor);
        const row = {
            ...sourceRow,
            vendor:
                pollenVendorOverride(
                    sourceRow.month,
                    vendor,
                    sourceRow.model.trim(),
                ) ?? vendor,
        };
        if (POLLEN_VALUE_FIELDS.every((field) => Number(row[field]) === 0)) {
            continue;
        }

        const key = pollenKey(row);
        const existing = aggregated.get(key);
        if (!existing) {
            aggregated.set(key, row);
            continue;
        }
        for (const field of POLLEN_VALUE_FIELDS) {
            existing[field] = Number(existing[field]) + Number(row[field]);
        }
    }

    return [...aggregated.values()].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.vendor.localeCompare(b.vendor) ||
            a.model.localeCompare(b.model),
    );
}

export type DataSource = Exclude<keyof Data, "providerObservations">;

export const DATA_SOURCES = [
    "opTransactions",
    "opCloud",
    "opPollen",
    "revenueShare",
    "stripeSales",
    "userBalances",
    "privateConfig",
] as const satisfies readonly DataSource[];

export async function loadAll(
    sources: readonly DataSource[] = DATA_SOURCES,
    signal?: AbortSignal,
): Promise<Data> {
    // Every requested source remains required. Unrelated views do not wait
    // for an expensive or unavailable endpoint they do not consume.
    const wanted = new Set(sources);
    const [
        opTransactions,
        opCloud,
        opPollen,
        revenueShare,
        stripeSales,
        userBalances,
        privateConfigRows,
    ] = await Promise.all([
        wanted.has("opTransactions")
            ? fetchPipe<OpTransactionRow>("economics_bank_ledger_api", signal)
            : undefined,
        wanted.has("opCloud")
            ? fetchPipe<OpCloudRow>("economics_compute_ledger_api", signal)
            : undefined,
        wanted.has("opPollen")
            ? fetchPipe<OpPollenRow>("economics_pollen_usage_api", signal)
            : undefined,
        wanted.has("revenueShare")
            ? fetchPipe<RevenueShareSourceRow>(
                  "economics_revenue_share_api",
                  signal,
              )
            : undefined,
        wanted.has("stripeSales")
            ? fetchPipe<StripeSalesRow>("economics_stripe_sales_api", signal)
            : undefined,
        wanted.has("userBalances")
            ? fetchPipe<UserBalanceSummaryRow>(
                  "economics_user_balances_api",
                  signal,
              )
            : undefined,
        wanted.has("privateConfig")
            ? fetchPipe<EconomicsPrivateConfigRow>(
                  "economics_private_config_api",
                  signal,
              )
            : undefined,
    ]);
    const privateConfig = privateConfigRows
        ? parsePrivateConfig(privateConfigRows[0])
        : undefined;

    const canonicalize = <T extends { vendor: string }>(row: T): T => ({
        ...row,
        vendor: canonicalVendor(row.vendor),
    });

    const providerObservations = collectProviderObservations({
        opTransactions,
        opCloud,
        opPollen,
    });

    return {
        opTransactions: opTransactions?.map(canonicalize),
        opCloud: opCloud?.map(canonicalize),
        opPollen: opPollen ? canonicalPollenRows(opPollen) : undefined,
        revenueShare,
        stripeSales,
        userBalances,
        providerObservations,
        privateConfig,
    };
}
