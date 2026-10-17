import { FIXTURES, PLANNING_DOCUMENT_FIXTURE } from "../fixtures";
import type {
    Data,
    EconomicsPrivateConfig,
    OpPollenRow,
    OpTransactionRow,
    RevenueShareSourceRow,
    StripeSalesRow,
    UserBalanceSummaryRow,
    VendorLedgerRow,
} from "../types";
import { validatePipeRows } from "./pipeContracts";
import {
    ledgerForecastRules,
    parsePlanningDocument,
    validateVendorPlan,
} from "./planning";
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

export async function fetchPipe<T>(
    pipe: string,
    signal?: AbortSignal,
): Promise<T[]> {
    if (fixturesMode()) {
        const rows = FIXTURES[pipe];
        if (!rows) throw new Error(`Missing fixture for pipe ${pipe}`);
        return validatePipeRows<T>(pipe, rows);
    }

    const res = await fetch(
        `/api/economics/pipes/${encodeURIComponent(pipe)}`,
        { credentials: "same-origin", signal },
    );
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

export type DataSource = Exclude<
    keyof Data,
    | "providerObservations"
    | "vendorStatements"
    | "vendorPlans"
    | "planningError"
>;

export const DATA_SOURCES = [
    "opTransactions",
    "vendorLedger",
    "opPollen",
    "revenueShare",
    "stripeSales",
    "userBalances",
    "privateConfig",
] as const satisfies readonly DataSource[];

export async function loadAll(
    sources: readonly DataSource[] = DATA_SOURCES,
    signal?: AbortSignal,
    journal?: EconomicsPrivateConfig,
): Promise<Data> {
    // Every requested source remains required. Unrelated views do not wait
    // for an expensive or unavailable endpoint they do not consume.
    const wanted = new Set(sources);
    let planningError: string | undefined;
    if (wanted.has("privateConfig")) wanted.add("vendorLedger");
    const [
        opTransactions,
        vendorLedger,
        opPollen,
        revenueShare,
        stripeSales,
        userBalances,
        planningDocument,
    ] = await Promise.all([
        wanted.has("opTransactions")
            ? fetchPipe<OpTransactionRow>("economics_bank_ledger_api", signal)
            : undefined,
        wanted.has("vendorLedger")
            ? fetchPipe<VendorLedgerRow>("economics_vendor_ledger_api", signal)
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
            ? fixturesMode()
                ? parsePlanningDocument(PLANNING_DOCUMENT_FIXTURE)
                : journal
            : undefined,
    ]);
    if (wanted.has("privateConfig") && !planningDocument)
        planningError = "Planning document unavailable";
    const canonicalize = <T extends { vendor: string }>(row: T): T => ({
        ...row,
        vendor: canonicalVendor(row.vendor),
    });

    const vendorPlans = vendorLedger
        ?.filter((row) => row.type === "planned")
        .map(canonicalize);
    let privateConfig: Data["privateConfig"];
    if (planningDocument) {
        try {
            for (const row of vendorPlans ?? []) validateVendorPlan(row);
            privateConfig = {
                ...planningDocument,
                forecastRules: ledgerForecastRules(
                    vendorPlans ?? [],
                    planningDocument,
                ),
            };
        } catch {
            planningError = "Vendor planning rows are invalid";
        }
    }

    const providerObservations = collectProviderObservations({
        opTransactions,
        vendorLedger: vendorLedger?.filter(
            (row) => row.type !== "statement" && row.type !== "planned",
        ),
        opPollen,
    });

    return {
        opTransactions: opTransactions?.map(canonicalize),
        vendorLedger: vendorLedger
            ?.filter(
                (row) => row.type !== "statement" && row.type !== "planned",
            )
            .map(canonicalize),
        vendorPlans,
        vendorStatements: vendorLedger
            ?.filter((row) => row.type === "statement")
            .map(canonicalize),
        opPollen: opPollen ? canonicalPollenRows(opPollen) : undefined,
        revenueShare,
        stripeSales,
        userBalances,
        providerObservations,
        privateConfig,
        ...(planningError ? { planningError } : {}),
    };
}
