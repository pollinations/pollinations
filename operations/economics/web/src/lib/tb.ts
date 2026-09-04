import { FIXTURES } from "../fixtures";
import type {
    Data,
    EconomicsPrivateConfig,
    EconomicsPrivateConfigRow,
    OpCloudRow,
    OpPollenRow,
    OpTransactionRow,
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

async function fetchPipe<T>(pipe: string): Promise<T[]> {
    if (fixturesMode()) {
        const rows = FIXTURES[pipe];
        if (!rows) throw new Error(`Missing fixture for pipe ${pipe}`);
        return validatePipeRows<T>(pipe, rows);
    }

    const res = await fetch(`/api/pipes/${encodeURIComponent(pipe)}`);
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

export async function loadAll(): Promise<Data> {
    // All three pipes are required contracts. A missing pipe (404) must surface
    // as an error, never render as plausible-but-empty economics data.
    const [opTransactions, opCloud, opPollen, privateConfigRows] =
        await Promise.all([
            fetchPipe<OpTransactionRow>("economics_bank_ledger_api"),
            fetchPipe<OpCloudRow>("economics_compute_ledger_api"),
            fetchPipe<OpPollenRow>("economics_pollen_usage_api"),
            fetchPipe<EconomicsPrivateConfigRow>(
                "economics_private_config_api",
            ),
        ]);
    if (privateConfigRows.length !== 1) {
        throw new Error(
            `economics_private_config_api: expected one row, received ${privateConfigRows.length}`,
        );
    }
    const privateConfig = parsePrivateConfig(privateConfigRows[0]);

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
        opTransactions: opTransactions.map(canonicalize),
        opCloud: opCloud.map(canonicalize),
        opPollen: canonicalPollenRows(opPollen),
        providerObservations,
        privateConfig,
    };
}
