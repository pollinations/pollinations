import type { Data, OpCloudRow } from "../types";
import { cloudCategory } from "./categories";
import {
    driveDocumentLink,
    hasArchivedEvidence,
    hasReconciledTransactionEvidence,
    isAcknowledgedLostTransactionEvidence,
} from "./documents";
import { type VendorPlanes, vendorPlanes } from "./insights";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
    WINDOW_START,
} from "./months";
import {
    providerCheckExplanation,
    providerMeteringBasis,
    providerReviewRows,
} from "./providerRegistry";

const ACTIVE_USD = 0.0001;

export type ProviderFundingStatus =
    | "billed"
    | "credit/free"
    | "mixed"
    | "not applicable"
    | "unknown"
    | "needs check";

export type ProviderCloseStatus =
    | "ready"
    | "missing document"
    | "needs provider check"
    | "needs account check";

export type TransactionDocumentStatus = "missing" | "acknowledged" | null;

export type ProviderCloseEvidence = {
    evidence: string;
    source: string;
    date: string;
};

export type ProviderCloseRow = {
    month: string;
    vendor: string;
    partial: boolean;
    closeStatus: ProviderCloseStatus;
    fundingStatus: ProviderFundingStatus;
    billedUsd: number | null;
    creditFreeUsd: number | null;
    transactionDocumentStatus: TransactionDocumentStatus;
    evidence: ProviderCloseEvidence[];
};

export type ProviderCloseSummary = {
    closedRows: number;
    partialRows: number;
    closeReady: number;
    blockers: number;
    billedUsd: number;
    creditFreeUsd: number;
};

export type ProviderClosePeriodStatus =
    | "no data"
    | "open"
    | "ready"
    | "action needed";

function active(value: number | null): boolean {
    return value != null && Math.abs(value) > ACTIVE_USD;
}

function fundingStatus({
    billedUsd,
    creditFreeUsd,
    hasProviderEvidence,
    providerCheckResolved,
    statementRequired,
}: {
    billedUsd: number | null;
    creditFreeUsd: number | null;
    hasProviderEvidence: boolean;
    providerCheckResolved: boolean;
    statementRequired: boolean;
}): ProviderFundingStatus {
    if (!hasProviderEvidence) {
        if (!statementRequired) return "not applicable";
        if (providerCheckResolved) return "unknown";
        return "needs check";
    }
    const billed = active(billedUsd);
    const credit = active(creditFreeUsd);
    if (billed && credit) return "mixed";
    if (billed) return "billed";
    return "credit/free";
}

function closeStatus({
    accountStatus,
    hasProviderEvidence,
    providerCheckResolved,
    statementRequired,
    transactionDocumentMissing,
}: {
    accountStatus:
        | "complete"
        | "partial"
        | "unassigned"
        | "no activity"
        | "not tracked";
    hasProviderEvidence: boolean;
    providerCheckResolved: boolean;
    statementRequired: boolean;
    transactionDocumentMissing: boolean;
}): ProviderCloseStatus {
    if (transactionDocumentMissing) return "missing document";
    if (accountStatus === "partial" || accountStatus === "unassigned") {
        return "needs account check";
    }
    if (!hasProviderEvidence && statementRequired && !providerCheckResolved) {
        return "needs provider check";
    }
    return "ready";
}

function providerEvidenceFor(
    rows: OpCloudRow[],
    month: string,
    vendor: string,
): OpCloudRow[] {
    return rows.filter(
        (row) =>
            cloudCategory(row) === "compute" &&
            !(row.credit > 0 && row.paid === 0) &&
            row.start.slice(0, 7) === month &&
            row.vendor === vendor,
    );
}

function dedupeEvidence(providerRows: OpCloudRow[]): ProviderCloseEvidence[] {
    const seen = new Set<string>();
    const result: ProviderCloseEvidence[] = [];
    const add = (entry: ProviderCloseEvidence) => {
        const link = driveDocumentLink(entry.evidence);
        if (!link) return;
        const identity = link.previewHref ?? link.href;
        const key = identity;
        if (seen.has(key)) return;
        seen.add(key);
        result.push(entry);
    };
    for (const row of providerRows) {
        add({
            evidence: row.evidence,
            source: row.source,
            date: row.start.slice(0, 10),
        });
    }
    return result;
}

export function providerCloseRows(
    data: Data,
    currentMonth = new Date().toISOString().slice(0, 7),
): ProviderCloseRow[] {
    const cloudRows = data.opCloud ?? [];
    const reviewByKey = new Map(
        providerReviewRows(data).map((row) => [
            `${row.month}|${row.provider}`,
            row,
        ]),
    );
    const planeByKey = new Map(
        vendorPlanes(data).map((plane) => [
            `${plane.month}|${plane.vendor}`,
            plane,
        ]),
    );
    const productKeys = new Set<string>();
    const productActivityKeys = new Set<string>();
    const transactionDocumentStatusByKey = new Map<
        string,
        Exclude<TransactionDocumentStatus, null>
    >();
    for (const row of data.opTransactions ?? []) {
        const month = row.date.slice(0, 7);
        if (
            row.kind === "transaction" &&
            month >= WINDOW_START &&
            !hasReconciledTransactionEvidence(row)
        ) {
            const key = `${month}|${row.vendor}`;
            const status = isAcknowledgedLostTransactionEvidence(row)
                ? "acknowledged"
                : "missing";
            if (
                status === "missing" ||
                !transactionDocumentStatusByKey.has(key)
            ) {
                transactionDocumentStatusByKey.set(key, status);
            }
            productKeys.add(key);
        }
    }
    for (const row of data.opPollen ?? []) {
        if (row.month >= WINDOW_START) {
            const key = `${row.month}|${row.vendor}`;
            productKeys.add(key);
            productActivityKeys.add(key);
        }
    }
    for (const row of cloudRows) {
        const month = row.start.slice(0, 7);
        if (
            month >= WINDOW_START &&
            cloudCategory(row) === "compute" &&
            !(row.credit > 0 && row.paid === 0)
        ) {
            const key = `${month}|${row.vendor}`;
            productKeys.add(key);
            productActivityKeys.add(key);
        }
    }
    const planes = [...productKeys].sort().map((key): VendorPlanes => {
        const existing = planeByKey.get(key);
        if (existing) return existing;
        const [month, vendor] = key.split("|");
        return {
            month,
            vendor,
            meteringBasis: providerMeteringBasis(vendor),
            cashUsd: null,
            cloudPaidUsd: null,
            cloudCreditUsd: null,
            cloudUsd: null,
            meterCloudUsd: null,
            pollenPaidCostUsd: null,
            pollenQuestCostUsd: null,
            pollenCostUsd: null,
            calibX: null,
            cashCoverage: null,
            meterCoverage: null,
            reconciliationExplanation: null,
            status: "ok",
        };
    });
    return planes.map((plane) => {
        const planeKey = `${plane.month}|${plane.vendor}`;
        const providerRows = providerEvidenceFor(
            cloudRows,
            plane.month,
            plane.vendor,
        );
        const hasProviderEvidence = providerRows.some((row) =>
            hasArchivedEvidence(row.evidence),
        );
        const meteringBasis = providerMeteringBasis(plane.vendor);
        const statementRequired =
            productActivityKeys.has(planeKey) &&
            meteringBasis !== "internal" &&
            meteringBasis !== "not_applicable";
        const providerCheckResolved =
            providerCheckExplanation(
                plane.month,
                plane.vendor,
                data.privateConfig,
            ) != null;
        const billedUsd = hasProviderEvidence
            ? (plane.cloudPaidUsd ?? 0)
            : null;
        const creditFreeUsd = hasProviderEvidence
            ? (plane.cloudCreditUsd ?? 0)
            : null;
        const funding = fundingStatus({
            billedUsd,
            creditFreeUsd,
            hasProviderEvidence,
            providerCheckResolved,
            statementRequired,
        });
        const review = reviewByKey.get(planeKey);
        const transactionDocumentStatus =
            transactionDocumentStatusByKey.get(planeKey) ?? null;
        const status = closeStatus({
            accountStatus: review?.accountStatus ?? "not tracked",
            hasProviderEvidence,
            providerCheckResolved,
            statementRequired,
            transactionDocumentMissing: transactionDocumentStatus === "missing",
        });
        return {
            month: plane.month,
            vendor: plane.vendor,
            partial: plane.month >= currentMonth,
            closeStatus: status,
            fundingStatus: funding,
            billedUsd,
            creditFreeUsd,
            transactionDocumentStatus,
            evidence: dedupeEvidence(providerRows),
        };
    });
}

export function visibleProviderCloseRows({
    month,
    rows,
    vendor,
}: {
    month: MonthFilterValue;
    rows: ProviderCloseRow[];
    vendor: ValueFilter;
}): ProviderCloseRow[] {
    return rows.filter(
        (row) =>
            matchesMonth(row.month, month) && matchesValue(row.vendor, vendor),
    );
}

export function providerCloseRank(row: ProviderCloseRow): number {
    if (!row.partial && row.closeStatus === "needs provider check") return 0;
    if (!row.partial && row.closeStatus === "needs account check") return 1;
    if (row.partial) return 2;
    return 3;
}

export function attentionFirst(rows: ProviderCloseRow[]): ProviderCloseRow[] {
    return [...rows].sort(
        (a, b) =>
            providerCloseRank(a) - providerCloseRank(b) ||
            b.month.localeCompare(a.month) ||
            a.vendor.localeCompare(b.vendor),
    );
}

export function providerCloseSummary(
    rows: ProviderCloseRow[],
): ProviderCloseSummary {
    const closedRows = rows.filter((row) => !row.partial);
    return {
        closedRows: closedRows.length,
        partialRows: rows.length - closedRows.length,
        closeReady: closedRows.filter((row) => row.closeStatus === "ready")
            .length,
        blockers: closedRows.filter(
            (row) =>
                row.closeStatus === "needs provider check" ||
                row.closeStatus === "needs account check",
        ).length,
        billedUsd: rows.reduce((sum, row) => sum + (row.billedUsd ?? 0), 0),
        creditFreeUsd: rows.reduce(
            (sum, row) => sum + (row.creditFreeUsd ?? 0),
            0,
        ),
    };
}

export function providerClosePeriodStatus(
    summary: ProviderCloseSummary,
): ProviderClosePeriodStatus {
    if (summary.closedRows === 0) {
        return summary.partialRows > 0 ? "open" : "no data";
    }
    if (summary.blockers > 0) return "action needed";
    return "ready";
}
