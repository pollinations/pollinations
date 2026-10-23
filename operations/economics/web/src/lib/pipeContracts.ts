import type {
    EconomicsPrivateConfig,
    EconomicsPrivateConfigRow,
} from "../types";
import { hasArchivedEvidence } from "./documents";
import { canonicalProvider } from "./providerRegistry";

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
            "paid_community_usage",
            "paid_model_creator_earnings",
            "quest_usage",
            "quest_creator_earnings",
            "quest_community_usage",
            "quest_model_creator_earnings",
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
            "dispute_fees",
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
        if (
            pipe === "economics_vendor_ledger_api" &&
            (row.type === "statement" ||
                (Array.isArray(row.compared_entry_ids) &&
                    row.compared_entry_ids.length))
        ) {
            if (
                (row.type === "statement" &&
                    (typeof row.statement_amount !== "number" ||
                        !Number.isFinite(row.statement_amount) ||
                        row.paid !== 0 ||
                        row.credit !== 0)) ||
                !Array.isArray(row.compared_entry_ids) ||
                row.compared_entry_ids.some(
                    (id: unknown) => typeof id !== "string" || !id,
                ) ||
                (row.compared_entry_ids.length > 0 &&
                    (!["cost", "balance"].includes(
                        String(row.comparison_basis),
                    ) ||
                        !/^\d{4}-\d{2}$/.test(String(row.comparison_month))))
            )
                throw new Error(`${pipe}[${index}]: invalid source comparison`);
        }
        for (const [field, allowed] of Object.entries(contract.enums ?? {})) {
            if (!allowed.includes(String(row[field]))) {
                throw new Error(`${pipe}[${index}].${field}: unexpected value`);
            }
        }
    });

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
        throw new Error("Planning document: invalid JSON");
    }
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Planning document: expected object");
    }
    const config = value as Partial<EconomicsPrivateConfig>;
    if (
        config.forecastRules == null ||
        typeof config.forecastRules !== "object" ||
        Array.isArray(config.forecastRules) ||
        "salesAdjustments" in config ||
        "reconciliation" in config ||
        config.reviewNotes == null ||
        typeof config.reviewNotes !== "object" ||
        "costDifferences" in config.reviewNotes ||
        !Array.isArray(config.reviewNotes.providerCheckExplanations) ||
        !Array.isArray(config.reviewNotes.meterDriftExplanations) ||
        !Array.isArray(config.reviewNotes.pollenWitnessExplanations)
    ) {
        throw new Error("Planning document: invalid shape");
    }
    const archiveChecks = config.reviewNotes.archiveChecks ?? [];
    if (
        !Array.isArray(archiveChecks) ||
        archiveChecks.some(
            (item) =>
                item == null ||
                !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.month) ||
                [item.provider, item.account, item.note].some(
                    (value) => typeof value !== "string" || !value.trim(),
                ) ||
                typeof item.checkedAt !== "string" ||
                !/^\d{4}-\d{2}-\d{2}T/.test(item.checkedAt) ||
                !Number.isFinite(Date.parse(item.checkedAt)) ||
                !["found", "partial", "not_found", "blocked"].includes(
                    item.status,
                ) ||
                !Array.isArray(item.evidence) ||
                item.evidence.some(
                    (link: unknown) =>
                        typeof link !== "string" || !hasArchivedEvidence(link),
                ) ||
                (["found", "partial"].includes(item.status) &&
                    !item.evidence.length),
        )
    ) {
        throw new Error("Planning document: invalid archive checks");
    }
    // Stored rules can predate a vendor rename, just like ledger rows.
    const forecastRules: EconomicsPrivateConfig["forecastRules"] = {};
    for (const [line, rule] of Object.entries(config.forecastRules)) {
        const [vendor, category, extra] = line.split("|");
        if (!vendor.trim() || !category?.trim() || extra !== undefined) {
            throw new Error(`Invalid forecast rule key: ${line}`);
        }
        const key = `${canonicalProvider(vendor)}|${category.trim().toLowerCase()}`;
        if (Object.hasOwn(forecastRules, key)) {
            throw new Error(`Duplicate forecast rule for ${key}`);
        }
        if (
            rule.salesStoppedFrom !== undefined &&
            (key !== "stripe sales|revenue" ||
                rule.salesStoppedFrom === null ||
                typeof rule.salesStoppedFrom !== "object" ||
                Array.isArray(rule.salesStoppedFrom) ||
                Object.entries(rule.salesStoppedFrom).some(
                    ([stream, date]) =>
                        !["pollen", "kofi"].includes(stream) ||
                        typeof date !== "string" ||
                        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                        !Number.isFinite(Date.parse(date)) ||
                        new Date(date).toISOString().slice(0, 10) !== date,
                ))
        )
            throw new Error("Invalid sales stop date");
        forecastRules[key] = rule;
    }
    return {
        ...config,
        forecastRules,
        reviewNotes: {
            ...config.reviewNotes,
            ...(config.reviewNotes.archiveChecks === undefined
                ? {}
                : {
                      archiveChecks: archiveChecks.map((item) => ({
                          ...item,
                          provider: canonicalProvider(item.provider),
                      })),
                  }),
        },
    } as EconomicsPrivateConfig;
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
