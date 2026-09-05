import { FIXTURES } from "../fixtures";
import type {
    Data,
    EconomicsPrivateConfig,
    EconomicsPrivateConfigRow,
    OpCloudRow,
    OpPollenRow,
    OpTransactionRow,
    RevenueShareSourceRow,
    StripeSalesRow,
    UserBalanceSummaryRow,
} from "../types";
import {
    canonicalProvider,
    collectProviderObservations,
} from "./providerRegistry";

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

type PipeContract = {
    strings: readonly string[];
    numbers: readonly string[];
    enums?: Readonly<Record<string, readonly string[]>>;
};

const PIPE_CONTRACTS: Record<string, PipeContract> = {
    economics_bank_ledger_api: {
        strings: [
            "entry_id",
            "kind",
            "source",
            "date",
            "vendor",
            "category",
            "currency",
            "description",
            "evidence",
            "recorded_at",
        ],
        numbers: ["amount"],
        enums: { kind: ["transaction", "opening_balance"] },
    },
    economics_compute_ledger_api: {
        strings: [
            "entry_id",
            "source",
            "vendor",
            "type",
            "start",
            "end",
            "currency",
            "resource_id",
            "resource_name",
            "resource_sku",
            "model",
            "evidence",
            "recorded_at",
        ],
        numbers: ["credit", "paid", "resource_count"],
    },
    economics_pollen_usage_api: {
        strings: ["month", "vendor", "model", "currency"],
        numbers: [
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
        ],
    },
    economics_private_config_api: {
        strings: ["config", "recorded_at"],
        numbers: [],
    },
    economics_revenue_share_api: {
        strings: [
            "row_type",
            "month",
            "recipient_id",
            "github_username",
            "recipient_name",
            "sources_json",
        ],
        numbers: [
            "paid_usage",
            "paid_creator_earnings",
            "paid_pollinations_profit",
            "quest_usage",
            "quest_creator_earnings",
            "paid_requests",
            "quest_requests",
        ],
        enums: {
            row_type: ["summary", "creator", "source"],
        },
    },
    economics_stripe_sales_api: {
        strings: ["month", "currency", "revenue_stream"],
        numbers: [
            "gross_sales",
            "refunds",
            "reversals",
            "net_sales",
            "stripe_fees",
            "net_after_fees",
            "payments",
            "refund_count",
        ],
        enums: { revenue_stream: ["pollen", "kofi"] },
    },
    economics_user_balances_api: {
        strings: ["synced_at"],
        numbers: [
            "users",
            "paid_users",
            "quest_users",
            "paid_balance",
            "quest_balance",
        ],
    },
};

export function validatePipeRows<T>(pipe: string, rows: unknown[]): T[] {
    const contract = PIPE_CONTRACTS[pipe];
    if (!contract) throw new Error(`Unknown pipe contract: ${pipe}`);

    rows.forEach((value, index) => {
        if (
            value == null ||
            typeof value !== "object" ||
            Array.isArray(value)
        ) {
            throw new Error(`${pipe}[${index}]: row must be an object`);
        }
        const row = value as Record<string, unknown>;
        for (const field of contract.strings) {
            if (typeof row[field] !== "string") {
                throw new Error(`${pipe}[${index}].${field}: expected string`);
            }
        }
        for (const field of contract.numbers) {
            if (
                typeof row[field] !== "number" ||
                !Number.isFinite(row[field])
            ) {
                throw new Error(`${pipe}[${index}].${field}: expected number`);
            }
        }
        for (const [field, allowed] of Object.entries(contract.enums ?? {})) {
            if (!allowed.includes(String(row[field]))) {
                throw new Error(`${pipe}[${index}].${field}: unexpected value`);
            }
        }
    });

    return rows as T[];
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

function parsePrivateConfig(
    row: EconomicsPrivateConfigRow,
): EconomicsPrivateConfig {
    const value: unknown = JSON.parse(row.config);
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("economics_private_config_api.config: expected object");
    }
    const config = value as Partial<EconomicsPrivateConfig>;
    if (
        config.forecastRules == null ||
        typeof config.forecastRules !== "object" ||
        Array.isArray(config.forecastRules) ||
        config.reconciliation == null ||
        typeof config.reconciliation !== "object" ||
        !Array.isArray(config.reconciliation.providerCheckExplanations) ||
        !Array.isArray(config.reconciliation.meterDriftExplanations) ||
        !Array.isArray(config.reconciliation.pollenWitnessExplanations)
    ) {
        throw new Error("economics_private_config_api.config: invalid shape");
    }
    return config as EconomicsPrivateConfig;
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
        const row = {
            ...sourceRow,
            vendor: canonicalVendor(sourceRow.vendor),
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
    if (
        userBalances &&
        (userBalances.length !== 1 || userBalances[0].users === 0)
    ) {
        throw new Error(
            `economics_user_balances_api: expected one populated D1 snapshot row, received ${userBalances.length}`,
        );
    }
    if (privateConfigRows && privateConfigRows.length !== 1) {
        throw new Error(
            `economics_private_config_api: expected one row, received ${privateConfigRows.length}`,
        );
    }
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
