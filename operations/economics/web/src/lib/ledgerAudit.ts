import type { Data, OpCloudRow, OpPollenRow, OpTransactionRow } from "../types";
import { cloudCategory, transactionCategory } from "./categories";
import {
    hasReconciledTransactionEvidence,
    isAcknowledgedLostTransactionEvidence,
} from "./documents";
import { canConvertToUsd, fxEstimatedMonths } from "./fx";
import {
    collectMonths,
    isDateKey,
    isMonthKey,
    type MonthFilterValue,
    matchesMonth,
} from "./months";
import { isCloudSource, isTransactionSource } from "./provenance";
import { missingProviderMappings } from "./providerRegistry";

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
    missingBankData: boolean;
    transactionEvidenceGaps: number;
    actionableTransactionEvidenceGaps: number;
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
        !canConvertToUsd(row.currency) ||
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
    return present(row.entry_id)
        ? JSON.stringify([row.source, row.entry_id])
        : "";
}

function cloudDuplicateKey(row: OpCloudRow): string {
    return present(row.entry_id)
        ? JSON.stringify([row.source, row.entry_id])
        : "";
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
        row.actionableTransactionEvidenceGaps > 0 ||
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
            const evidenceGaps = transactions.filter(
                (row) => !hasReconciledTransactionEvidence(row),
            );
            const actionableEvidenceGaps = evidenceGaps.filter(
                (row) => !isAcknowledgedLostTransactionEvidence(row),
            );
            const mappingGaps = missingProviderMappings(data, month);
            const missingMappingProviders = [
                ...new Set(mappingGaps.map((row) => row.provider)),
            ].sort((a, b) => a.localeCompare(b));
            const invalidTransactions = bankRows.filter(invalidTransaction);
            const invalidCloudRows = cloud.filter(invalidCloud);
            const invalidPollenRows = pollen.filter(invalidPollen);
            const partial = month >= currentMonth;
            const base = {
                month,
                partial,
                transactionRows: transactions.length,
                cloudRows: cloud.length,
                pollenRows: pollen.length,
                missingBankData: !partial && transactions.length === 0,
                transactionEvidenceGaps: evidenceGaps.length,
                actionableTransactionEvidenceGaps:
                    actionableEvidenceGaps.length,
                transactionEvidenceProviders: providerNames(evidenceGaps),
                missingMappings: missingMappingProviders.length,
                missingMappingProviders,
                estimatedFx: estimatedFxMonths.has(month),
                invalidRows:
                    invalidTransactions.length +
                    invalidCloudRows.length +
                    invalidPollenRows.length,
                invalidProviders: providerNames([
                    ...invalidTransactions,
                    ...invalidCloudRows,
                    ...invalidPollenRows,
                ]),
                // OP Pollen is unique at its raw provider/model grain. After
                // canonical aliases merge (for example bedrock -> aws), two
                // legitimate source rows may share the display key and must be
                // summed rather than reported as duplicates.
                // Equal charges can be legitimate (for example several Polar
                // subscriptions on the same day). Only a repeated source ID is
                // a duplicate; matching financial values are not identity.
                duplicateRows:
                    duplicateExtras(bankRows, transactionDuplicateKey) +
                    duplicateExtras(cloud, cloudDuplicateKey),
                duplicateProviders: [
                    ...new Set([
                        ...providersWithDuplicateKeys(
                            bankRows,
                            transactionDuplicateKey,
                        ),
                        ...providersWithDuplicateKeys(cloud, cloudDuplicateKey),
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
    const broadFilter =
        typeof filter === "string"
            ? filter === "" || filter.length === 4
            : filter.length === 0;
    const invalidDateRows = [
        ...invalidDateTransactions,
        ...invalidDateCloud,
        ...invalidDatePollen,
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
            missingBankData: false,
            transactionEvidenceGaps: 0,
            actionableTransactionEvidenceGaps: 0,
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
