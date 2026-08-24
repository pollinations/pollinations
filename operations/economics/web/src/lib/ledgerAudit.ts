import type {
    Data,
    OpCloudRow,
    OpForecastRow,
    OpPollenRow,
    OpTransactionRow,
} from "../types";
import {
    cloudCategory,
    forecastCategory,
    transactionCategory,
} from "./categories";
import { hasReconciledTransactionEvidence } from "./documents";
import { fxEstimatedMonths } from "./fx";
import {
    collectMonths,
    isDateKey,
    isMonthKey,
    type MonthFilterValue,
    matchesMonth,
    WINDOW_START,
} from "./months";
import { isCloudSource, isTransactionSource } from "./provenance";
import { missingProviderMappings } from "./providerRegistry";

const CURRENCY_RE = /^[A-Z]{3}$/;
const FORECAST_CURRENCIES = new Set(["EUR", "USD"]);
const FORECAST_METHODS = new Set(["fixed", "funded", "last", "one_off"]);
const POLLEN_MEASURES: (keyof OpPollenRow)[] = [
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
];

export type MonthlyLedgerAuditStatus = "clean" | "attention" | "structural";

export type MonthlyLedgerAuditRow = {
    month: string;
    status: MonthlyLedgerAuditStatus;
    partial: boolean;
    transactionRows: number;
    cloudRows: number;
    pollenRows: number;
    forecastRows: number;
    missingBankData: boolean;
    transactionEvidenceGaps: number;
    transactionEvidenceProviders: string[];
    missingMappings: number;
    missingMappingProviders: string[];
    estimatedFx: boolean;
    invalidRows: number;
    invalidProviders: string[];
    duplicateRows: number;
    duplicateProviders: string[];
};

function present(value: unknown): boolean {
    return String(value ?? "").trim().length > 0;
}

function finite(value: unknown): boolean {
    return Number.isFinite(Number(value));
}

function invalidTransaction(row: OpTransactionRow): boolean {
    return (
        !present(row.entry_id) ||
        (row.kind !== "transaction" && row.kind !== "opening_balance") ||
        !isTransactionSource(row.source) ||
        !isDateKey(row.date) ||
        !present(row.vendor) ||
        transactionCategory(row) === "uncategorized" ||
        !finite(row.amount) ||
        !CURRENCY_RE.test(row.currency) ||
        !present(row.recorded_at)
    );
}

function invalidCloud(row: OpCloudRow): boolean {
    const balance = row.type.trim().toLowerCase() === "balance";
    return (
        !present(row.entry_id) ||
        !isCloudSource(row.source) ||
        !present(row.vendor) ||
        (!balance && cloudCategory(row) === "uncategorized") ||
        !isMonthKey(String(row.start ?? "").slice(0, 7)) ||
        !finite(row.credit) ||
        !finite(row.paid) ||
        (balance && (Number(row.credit) < 0 || Number(row.paid) < 0)) ||
        !CURRENCY_RE.test(row.currency) ||
        !present(row.recorded_at)
    );
}

function invalidPollen(row: OpPollenRow): boolean {
    return (
        !isMonthKey(row.month) ||
        !present(row.vendor) ||
        !present(row.model) ||
        row.currency !== "USD" ||
        POLLEN_MEASURES.some(
            (field) => !finite(row[field]) || Number(row[field]) < 0,
        )
    );
}

function invalidForecast(row: OpForecastRow): boolean {
    return (
        !present(row.entry_id) ||
        !isDateKey(row.month) ||
        !row.month.endsWith("-01") ||
        !present(row.vendor) ||
        forecastCategory(row) === "uncategorized" ||
        !finite(row.amount) ||
        !FORECAST_CURRENCIES.has(row.currency) ||
        !FORECAST_METHODS.has(row.method) ||
        !present(row.source) ||
        !present(row.recorded_at)
    );
}

function duplicateExtras<T>(rows: readonly T[], key: (row: T) => string) {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const value = key(row);
        if (!value) continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.values()].reduce(
        (total, count) => total + Math.max(0, count - 1),
        0,
    );
}

function providerNames(rows: readonly { vendor: string }[]): string[] {
    return [
        ...new Set(
            rows.map(
                (row) => String(row.vendor ?? "").trim() || "missing vendor",
            ),
        ),
    ].sort((a, b) => a.localeCompare(b));
}

function providersWithDuplicateKeys<T extends { vendor: string }>(
    rows: readonly T[],
    key: (row: T) => string,
): string[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const value = key(row);
        if (!value) continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return providerNames(
        rows.filter((row) => {
            const value = key(row);
            return value !== "" && (counts.get(value) ?? 0) > 1;
        }),
    );
}

function transactionDuplicateKey(row: OpTransactionRow): string {
    return JSON.stringify([
        row.kind,
        row.source,
        row.date,
        row.vendor,
        row.category,
        row.amount,
        row.currency,
        row.description,
        row.evidence,
    ]);
}

function cloudDuplicateKey(row: OpCloudRow): string {
    return JSON.stringify([
        row.source,
        row.start,
        row.end,
        row.vendor,
        row.account_id ?? "",
        row.account_name ?? "",
        row.type,
        row.model,
        row.credit,
        row.paid,
        row.currency,
        row.evidence,
        row.resource_sku,
        row.resource_count,
        row.resource_id,
        row.resource_name,
    ]);
}

function forecastDuplicateKey(row: OpForecastRow): string {
    return JSON.stringify([
        row.month,
        row.vendor,
        row.category,
        row.amount,
        row.currency,
        row.method,
        row.source,
        row.evidence,
    ]);
}

function statusFor(
    row: Omit<MonthlyLedgerAuditRow, "status">,
): MonthlyLedgerAuditStatus {
    if (
        row.invalidRows > 0 ||
        row.duplicateRows > 0 ||
        row.missingMappings > 0
    ) {
        return "structural";
    }
    if (
        row.missingBankData ||
        row.transactionEvidenceGaps > 0 ||
        row.estimatedFx
    ) {
        return "attention";
    }
    return "clean";
}

export function monthlyLedgerAuditRows(
    data: Data,
    filter: MonthFilterValue = "",
    currentMonth = new Date().toISOString().slice(0, 7),
): MonthlyLedgerAuditRow[] {
    const estimatedFxMonths = new Set(fxEstimatedMonths(data));

    const auditMonths = new Set(collectMonths(data));
    for (const row of data.opForecast ?? []) {
        const month = String(row.month ?? "").slice(0, 7);
        if (isMonthKey(month) && month >= WINDOW_START) auditMonths.add(month);
    }

    const rows = [...auditMonths]
        .sort((a, b) => a.localeCompare(b))
        .filter((month) => matchesMonth(month, filter))
        .map((month) => {
            const bankRows = (data.opTransactions ?? []).filter(
                (row) => row.date.slice(0, 7) === month,
            );
            const transactions = bankRows.filter(
                (row) => row.kind === "transaction",
            );
            const cloud = (data.opCloud ?? []).filter(
                (row) => row.start.slice(0, 7) === month,
            );
            const pollen = (data.opPollen ?? []).filter(
                (row) => row.month === month,
            );
            const forecast = (data.opForecast ?? []).filter(
                (row) => row.month.slice(0, 7) === month,
            );
            const evidenceGaps = transactions.filter(
                (row) => !hasReconciledTransactionEvidence(row),
            );
            const mappingGaps = missingProviderMappings(data, month);
            const missingMappingProviders = [
                ...new Set(mappingGaps.map((row) => row.provider)),
            ].sort((a, b) => a.localeCompare(b));
            const invalidTransactions = bankRows.filter(invalidTransaction);
            const invalidCloudRows = cloud.filter(invalidCloud);
            const invalidPollenRows = pollen.filter(invalidPollen);
            const invalidForecastRows = forecast.filter(invalidForecast);
            const partial = month >= currentMonth;
            const base = {
                month,
                partial,
                transactionRows: transactions.length,
                cloudRows: cloud.length,
                pollenRows: pollen.length,
                forecastRows: forecast.length,
                missingBankData: !partial && transactions.length === 0,
                transactionEvidenceGaps: evidenceGaps.length,
                transactionEvidenceProviders: providerNames(evidenceGaps),
                missingMappings: missingMappingProviders.length,
                missingMappingProviders,
                estimatedFx: estimatedFxMonths.has(month),
                invalidRows:
                    invalidTransactions.length +
                    invalidCloudRows.length +
                    invalidPollenRows.length +
                    invalidForecastRows.length,
                invalidProviders: providerNames([
                    ...invalidTransactions,
                    ...invalidCloudRows,
                    ...invalidPollenRows,
                    ...invalidForecastRows,
                ]),
                // OP Pollen is unique at its raw provider/model grain. After
                // canonical aliases merge (for example bedrock -> aws), two
                // legitimate source rows may share the display key and must be
                // summed rather than reported as duplicates.
                // The effective Tinybird endpoints already expose one row per
                // entry_id. Detect distinct IDs that repeat the same complete
                // financial fact instead of re-counting correction history.
                duplicateRows:
                    duplicateExtras(bankRows, transactionDuplicateKey) +
                    duplicateExtras(cloud, cloudDuplicateKey) +
                    duplicateExtras(forecast, forecastDuplicateKey),
                duplicateProviders: [
                    ...new Set([
                        ...providersWithDuplicateKeys(
                            bankRows,
                            transactionDuplicateKey,
                        ),
                        ...providersWithDuplicateKeys(cloud, cloudDuplicateKey),
                        ...providersWithDuplicateKeys(
                            forecast,
                            forecastDuplicateKey,
                        ),
                    ]),
                ].sort((a, b) => a.localeCompare(b)),
            };
            return { ...base, status: statusFor(base) };
        });

    const invalidDateTransactions = (data.opTransactions ?? []).filter(
        (row) => !isDateKey(String(row.date ?? "")),
    );
    const invalidDateCloud = (data.opCloud ?? []).filter(
        (row) => !isMonthKey(String(row.start ?? "").slice(0, 7)),
    );
    const invalidDatePollen = (data.opPollen ?? []).filter(
        (row) => !isMonthKey(String(row.month ?? "")),
    );
    const invalidDateForecast = (data.opForecast ?? []).filter(
        (row) =>
            !isDateKey(String(row.month ?? "")) ||
            !String(row.month ?? "").endsWith("-01"),
    );
    const broadFilter =
        typeof filter === "string"
            ? filter === "" || filter.length === 4
            : filter.length === 0;
    const invalidDateRows = [
        ...invalidDateTransactions,
        ...invalidDateCloud,
        ...invalidDatePollen,
        ...invalidDateForecast,
    ];
    if (broadFilter && invalidDateRows.length > 0) {
        rows.push({
            month: "Invalid date",
            status: "structural",
            partial: false,
            transactionRows: invalidDateTransactions.filter(
                (row) => row.kind === "transaction",
            ).length,
            cloudRows: invalidDateCloud.length,
            pollenRows: invalidDatePollen.length,
            forecastRows: invalidDateForecast.length,
            missingBankData: false,
            transactionEvidenceGaps: 0,
            transactionEvidenceProviders: [],
            missingMappings: 0,
            missingMappingProviders: [],
            estimatedFx: false,
            invalidRows: invalidDateRows.length,
            invalidProviders: providerNames(invalidDateRows),
            duplicateRows: 0,
            duplicateProviders: [],
        });
    }

    return rows.sort((a, b) => b.month.localeCompare(a.month));
}
