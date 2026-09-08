import type {
    EconomicsPrivateConfig,
    EconomicsPrivateConfigRow,
} from "../types";

export type RevenueShareSource = {
    type: "app" | "model";
    id: string;
    name: string;
    models: string[];
};

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
    economics_vendor_ledger_api: {
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

export const REQUIRED_PIPES = Object.keys(PIPE_CONTRACTS);

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

    if (pipe === "economics_private_config_api" && rows.length !== 1) {
        throw new Error(`${pipe}: expected one row, received ${rows.length}`);
    }
    if (
        pipe === "economics_user_balances_api" &&
        (rows.length !== 1 || (rows[0] as { users: number }).users <= 0)
    ) {
        throw new Error(
            `${pipe}: expected one populated D1 snapshot row, received ${rows.length}`,
        );
    }
    if (pipe === "economics_revenue_share_api") {
        for (const row of rows) {
            parseRevenueShareSources(
                (row as { sources_json: string }).sources_json,
            );
        }
    }

    return rows as T[];
}

export function parsePrivateConfig(
    row: EconomicsPrivateConfigRow,
): EconomicsPrivateConfig {
    let value: unknown;
    try {
        value = JSON.parse(row.config);
    } catch {
        throw new Error("economics_private_config_api.config: invalid JSON");
    }
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

export function parseRevenueShareSources(value: string): RevenueShareSource[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error("Revenue Share sources: invalid JSON");
    }
    if (!Array.isArray(parsed)) {
        throw new Error("Revenue Share sources must be an array");
    }

    const sources = new Map<string, RevenueShareSource>();
    parsed.forEach((source, index) => {
        if (
            !Array.isArray(source) ||
            source.length !== 4 ||
            (source[0] !== "app" && source[0] !== "model") ||
            source.slice(1).some((field) => typeof field !== "string")
        ) {
            throw new Error(`Revenue Share source ${index} is invalid`);
        }
        const key = `${source[0]}|${source[1]}`;
        const existing: RevenueShareSource = sources.get(key) ?? {
            type: source[0],
            id: source[1] as string,
            name: source[2] as string,
            models: [],
        };
        const model = source[3] as string;
        if (model && !existing.models.includes(model)) {
            existing.models.push(model);
        }
        sources.set(key, existing);
    });

    return [...sources.values()]
        .map((source) => ({
            ...source,
            models: [...source.models].sort(),
        }))
        .sort(
            (a, b) =>
                a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
        );
}
