import type { Data, OpCloudRow } from "../types";
import { cloudCategory } from "./categories";
import { opCloudCreditBurnUsd, opCloudPaidBurnUsd } from "./computeLedger";
import {
    driveDocumentLink,
    hasArchivedEvidence,
    hasReconciledTransactionEvidence,
    isAcknowledgedLostTransactionEvidence,
} from "./documents";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
    WINDOW_START,
} from "./months";
import {
    canonicalProviderAccountId,
    providerCheckExplanation,
    providerMeteringBasis,
    providerReviewRows,
    resolveProvider,
} from "./providerRegistry";
import { type VendorPlanes, vendorPlanes } from "./vendorReconciliation";

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
    coverageStatus:
        | "complete"
        | "partial"
        | "missing"
        | "exception"
        | "not required";
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
    if (
        accountStatus === "partial" ||
        accountStatus === "unassigned" ||
        (statementRequired && accountStatus === "no activity")
    ) {
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
            ["compute", "infrastructure"].includes(cloudCategory(row)) &&
            !(row.credit > 0 && row.paid === 0) &&
            row.start.slice(0, 7) === month &&
            row.vendor === vendor,
    );
}

function coversCalendarMonth(rows: OpCloudRow[], month: string): boolean {
    const start = Date.parse(`${month}-01T00:00:00Z`);
    const date = new Date(start);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const end = date.getTime();
    let covered = start;
    const intervals = rows
        .filter((row) => hasArchivedEvidence(row.evidence))
        .map((row) => [
            Date.parse(
                row.start.replace(" ", "T") +
                    (row.start.endsWith("Z") ? "" : "Z"),
            ),
            Date.parse(
                row.end.replace(" ", "T") + (row.end.endsWith("Z") ? "" : "Z"),
            ),
        ])
        .filter(
            ([from, to]) =>
                Number.isFinite(from) && Number.isFinite(to) && to > from,
        )
        .sort((a, b) => a[0] - b[0]);
    for (const [from, to] of intervals) {
        if (from > covered) break;
        covered = Math.max(covered, to);
    }
    return covered >= end;
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
    for (const [key, review] of reviewByKey) {
        if (review.monthlyReview) {
            productKeys.add(key);
            productActivityKeys.add(key);
        }
    }
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
            ["compute", "infrastructure"].includes(cloudCategory(row)) &&
            !(row.credit > 0 && row.paid === 0)
        ) {
            const key = `${month}|${row.vendor}`;
            productKeys.add(key);
            productActivityKeys.add(key);
        }
    }
    const planes = [...productKeys]
        .sort(
            (a, b) =>
                Number(
                    transactionDocumentStatusByKey.has(b) ||
                        (reviewByKey.get(b)?.sources.length ?? 0) > 0,
                ) -
                    Number(
                        transactionDocumentStatusByKey.has(a) ||
                            (reviewByKey.get(a)?.sources.length ?? 0) > 0,
                    ) || a.localeCompare(b),
        )
        .map((key): VendorPlanes => {
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
        const hasProviderEvidence =
            providerRows.length > 0 &&
            providerRows.every((row) => hasArchivedEvidence(row.evidence));
        const meteringBasis = providerMeteringBasis(plane.vendor);
        const statementRequired =
            productActivityKeys.has(planeKey) &&
            meteringBasis !== "internal" &&
            (meteringBasis !== "not_applicable" ||
                providerRows.some(
                    (row) => cloudCategory(row) === "infrastructure",
                ));
        const providerCheckResolved =
            providerCheckExplanation(
                plane.month,
                plane.vendor,
                data.privateConfig,
            ) != null;
        const billedUsd = hasProviderEvidence
            ? providerRows.reduce(
                  (sum, row) => sum + opCloudPaidBurnUsd(row),
                  0,
              )
            : null;
        const creditFreeUsd = hasProviderEvidence
            ? providerRows.reduce(
                  (sum, row) => sum + opCloudCreditBurnUsd(row),
                  0,
              )
            : null;
        const funding = fundingStatus({
            billedUsd,
            creditFreeUsd,
            hasProviderEvidence,
            providerCheckResolved,
            statementRequired,
        });
        const review = reviewByKey.get(planeKey);
        const provider = resolveProvider(plane.vendor);
        const accounts = review?.expectedAccounts ?? [];
        const completeCoverage =
            accounts.length > 0
                ? accounts.every((account) =>
                      coversCalendarMonth(
                          providerRows.filter(
                              (row) =>
                                  canonicalProviderAccountId(
                                      provider,
                                      row.account_id,
                                  ) === account.id,
                          ),
                          plane.month,
                      ),
                  )
                : coversCalendarMonth(providerRows, plane.month);
        const coverageStatus = !statementRequired
            ? ("not required" as const)
            : providerCheckResolved
              ? ("exception" as const)
              : providerRows.length === 0
                ? ("missing" as const)
                : completeCoverage
                  ? ("complete" as const)
                  : ("partial" as const);
        const transactionDocumentStatus =
            transactionDocumentStatusByKey.get(planeKey) ?? null;
        const status = closeStatus({
            accountStatus: review?.accountStatus ?? "not tracked",
            hasProviderEvidence: hasProviderEvidence && completeCoverage,
            providerCheckResolved,
            statementRequired,
            transactionDocumentMissing: transactionDocumentStatus === "missing",
        });
        return {
            coverageStatus,
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
    if (!row.partial && row.transactionDocumentStatus === "missing") return 2;
    if (row.partial) return 3;
    return 4;
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
                row.closeStatus === "needs account check" ||
                row.closeStatus === "missing document",
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
