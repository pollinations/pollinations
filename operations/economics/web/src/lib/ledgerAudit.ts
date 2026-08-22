import type { Data, OpCloudRow, OpPollenRow, OpTransactionRow } from "../types";
import { hasArchivedEvidence } from "./documents";
import { fxEstimatedMonths } from "./fx";
import { isCloudType, isTransactionCategory } from "./ledgerSchema";
import {
    collectMonths,
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
} from "./months";
import { isCloudSource, isTransactionSource } from "./provenance";
import {
    missingProviderMappings,
    providerReviewRows,
} from "./providerRegistry";

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
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
    transactionEvidenceGaps: number;
    cloudEvidenceGaps: number;
    missingMappings: number;
    dashboardChecksDue: number;
    estimatedFx: boolean;
    invalidRows: number;
    duplicateRows: number;
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
        !isTransactionSource(row.source) ||
        !DATE_RE.test(row.date) ||
        !present(row.vendor) ||
        !isTransactionCategory(row.category) ||
        !finite(row.amount) ||
        !CURRENCY_RE.test(row.currency) ||
        !present(row.recorded_at)
    );
}

function invalidCloud(row: OpCloudRow): boolean {
    return (
        !present(row.entry_id) ||
        !isCloudSource(row.source) ||
        !present(row.vendor) ||
        !isCloudType(row.type) ||
        !MONTH_RE.test(row.start.slice(0, 7)) ||
        !finite(row.credit) ||
        !finite(row.paid) ||
        !CURRENCY_RE.test(row.currency) ||
        !present(row.recorded_at)
    );
}

function invalidPollen(row: OpPollenRow): boolean {
    return (
        !MONTH_RE.test(row.month) ||
        !present(row.vendor) ||
        !present(row.model) ||
        row.currency !== "USD" ||
        POLLEN_MEASURES.some(
            (field) => !finite(row[field]) || Number(row[field]) < 0,
        )
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

function providerEvidenceGaps(rows: OpCloudRow[]): number {
    const providers = new Map<string, OpCloudRow[]>();
    for (const row of rows) {
        if (row.credit > 0 && row.paid === 0) continue;
        const providerRows = providers.get(row.vendor) ?? [];
        providerRows.push(row);
        providers.set(row.vendor, providerRows);
    }
    return [...providers.values()].filter(
        (providerRows) =>
            !providerRows.some((row) => hasArchivedEvidence(row.evidence)),
    ).length;
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
        row.transactionEvidenceGaps > 0 ||
        row.cloudEvidenceGaps > 0 ||
        row.dashboardChecksDue > 0 ||
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
    vendor: ValueFilter = "all",
): MonthlyLedgerAuditRow[] {
    const estimatedFxMonths = new Set(fxEstimatedMonths(data));

    return collectMonths(data)
        .filter((month) => matchesMonth(month, filter))
        .map((month) => {
            const transactions = (data.opTransactions ?? []).filter(
                (row) =>
                    row.date.slice(0, 7) === month &&
                    matchesValue(row.vendor, vendor),
            );
            const cloud = (data.opCloud ?? []).filter(
                (row) =>
                    row.start.slice(0, 7) === month &&
                    matchesValue(row.vendor, vendor),
            );
            const pollen = (data.opPollen ?? []).filter(
                (row) =>
                    row.month === month && matchesValue(row.vendor, vendor),
            );
            const review = providerReviewRows(data, month).filter((row) =>
                matchesValue(row.provider, vendor),
            );
            const partial = month >= currentMonth;
            const base = {
                month,
                partial,
                transactionRows: transactions.length,
                cloudRows: cloud.length,
                pollenRows: pollen.length,
                transactionEvidenceGaps: transactions.filter(
                    (row) => !hasArchivedEvidence(row.evidence),
                ).length,
                cloudEvidenceGaps: providerEvidenceGaps(cloud),
                missingMappings: new Set(
                    missingProviderMappings(data, month)
                        .filter((row) => matchesValue(row.provider, vendor))
                        .map((row) => row.provider),
                ).size,
                dashboardChecksDue: review.filter(
                    (row) => row.dashboardStatus === "due",
                ).length,
                estimatedFx: estimatedFxMonths.has(month),
                invalidRows:
                    transactions.filter(invalidTransaction).length +
                    cloud.filter(invalidCloud).length +
                    pollen.filter(invalidPollen).length,
                // OP Pollen is unique at its raw provider/model grain. After
                // canonical aliases merge (for example bedrock -> aws), two
                // legitimate source rows may share the display key and must be
                // summed rather than reported as duplicates.
                duplicateRows:
                    duplicateExtras(transactions, (row) => row.entry_id) +
                    duplicateExtras(cloud, (row) => row.entry_id),
            };
            return { ...base, status: statusFor(base) };
        })
        .sort((a, b) => b.month.localeCompare(a.month));
}
