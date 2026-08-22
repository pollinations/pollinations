import type { Data, OpCloudRow, OpTransactionRow } from "../types";
import { hasArchivedEvidence } from "./documents";
import { toUsd } from "./fx";
import type { EconRow, VendorPlanes } from "./insights";
import {
    modelEconomics,
    monthShift,
    providerEconomics,
    vendorPlanes,
} from "./insights";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
} from "./months";
import { providerMeteringBasis } from "./providerRegistry";

const ACTIVE_USD = 0.0001;

export type ProviderFundingStatus =
    | "billed"
    | "credit/free"
    | "mixed"
    | "needs check";

export type ProviderCloseStatus =
    | "ready"
    | "needs provider check"
    | "needs payment match"
    | "needs usage match"
    | "review allocation";

export type ProviderCloseEvidence = {
    kind: "provider" | "wise";
    evidence: string;
    source: string;
    date: string;
};

export type ProviderCloseModelRow = {
    vendor: string;
    model: string;
    retainedRevenueUsd: number;
    paidComputeCashUsd: number | null;
    paidContributionUsd: number | null;
    questCashSubsidyUsd: number | null;
    netCashContributionUsd: number | null;
    economicContributionUsd: number | null;
};

export type ProviderCloseRow = {
    month: string;
    vendor: string;
    closeStatus: ProviderCloseStatus;
    fundingStatus: ProviderFundingStatus;
    retainedRevenueUsd: number;
    billedUsd: number | null;
    creditFreeUsd: number | null;
    wiseCashUsd: number | null;
    wiseCashMonth: string | null;
    cashCoverage: VendorPlanes["cashCoverage"];
    paidContributionUsd: number | null;
    questCashSubsidyUsd: number | null;
    netCashContributionUsd: number | null;
    economicContributionUsd: number | null;
    evidence: ProviderCloseEvidence[];
    models: ProviderCloseModelRow[];
};

export type ProviderCloseSummary = {
    rows: number;
    providers: number;
    ready: number;
    needsAttention: number;
    retainedRevenueUsd: number;
    billedUsd: number;
    creditFreeUsd: number;
    netCashContributionUsd: number;
    unknownContributionRows: number;
};

function active(value: number | null): boolean {
    return value != null && Math.abs(value) > ACTIVE_USD;
}

function fundingStatus({
    billedUsd,
    creditFreeUsd,
    hasProviderEvidence,
}: {
    billedUsd: number | null;
    creditFreeUsd: number | null;
    hasProviderEvidence: boolean;
}): ProviderFundingStatus {
    if (!hasProviderEvidence) return "needs check";
    const billed = active(billedUsd);
    const credit = active(creditFreeUsd);
    if (billed && credit) return "mixed";
    if (billed) return "billed";
    return "credit/free";
}

function closeStatus({
    billedUsd,
    hasProviderEvidence,
    hasUsage,
    plane,
}: {
    billedUsd: number | null;
    hasProviderEvidence: boolean;
    hasUsage: boolean;
    plane: VendorPlanes;
}): ProviderCloseStatus {
    if (hasUsage && !hasProviderEvidence) return "needs provider check";
    if (!hasUsage && hasProviderEvidence) return "needs usage match";
    if (active(billedUsd) && plane.cashCoverage === "missing cash") {
        return "needs payment match";
    }
    if (plane.status === "drift") return "review allocation";
    return "ready";
}

function cashBreakdown(row: EconRow) {
    if (row.trueCostPaidUsd == null || row.questBurnUsd == null) return null;
    const creditShare = Math.min(
        1,
        Math.max(0, (row.creditSharePct ?? 0) / 100),
    );
    const paidComputeCashUsd = Math.max(
        0,
        row.trueCostPaidUsd * (1 - creditShare),
    );
    const questCashSubsidyUsd = Math.max(
        0,
        row.questBurnUsd * (1 - creditShare),
    );
    return {
        paidComputeCashUsd,
        paidContributionUsd: row.retainedPaidUsd - paidComputeCashUsd,
        questCashSubsidyUsd,
        netCashContributionUsd:
            row.retainedPaidUsd - paidComputeCashUsd - questCashSubsidyUsd,
    };
}

function modelCloseRow(
    row: EconRow,
    providerChecked: boolean,
    verifiedZeroCash: boolean,
): ProviderCloseModelRow {
    const breakdown = providerChecked ? cashBreakdown(row) : null;
    const paidComputeCashUsd =
        providerChecked && verifiedZeroCash
            ? 0
            : (breakdown?.paidComputeCashUsd ?? null);
    const questCashSubsidyUsd =
        providerChecked && verifiedZeroCash
            ? 0
            : (breakdown?.questCashSubsidyUsd ?? null);
    return {
        vendor: row.vendor,
        model: row.model ?? "",
        retainedRevenueUsd: row.retainedPaidUsd,
        paidComputeCashUsd,
        paidContributionUsd:
            paidComputeCashUsd == null
                ? null
                : row.retainedPaidUsd - paidComputeCashUsd,
        questCashSubsidyUsd,
        netCashContributionUsd:
            paidComputeCashUsd == null || questCashSubsidyUsd == null
                ? null
                : row.retainedPaidUsd -
                  paidComputeCashUsd -
                  questCashSubsidyUsd,
        economicContributionUsd: row.marginUsd,
    };
}

function providerEvidenceFor(
    rows: OpCloudRow[],
    month: string,
    vendor: string,
): OpCloudRow[] {
    return rows.filter(
        (row) =>
            row.type !== "infra" &&
            !(row.credit > 0 && row.paid === 0) &&
            row.start.slice(0, 7) === month &&
            row.vendor === vendor,
    );
}

function cashSpendUsd(rows: OpTransactionRow[]): number {
    return rows.reduce(
        (sum, row) => sum - toUsd(row.amount, row.currency, row.date),
        0,
    );
}

function paymentWitnessFor(
    rows: OpTransactionRow[],
    plane: VendorPlanes,
    billedUsd: number | null,
): { rows: OpTransactionRow[]; month: string | null; usd: number | null } {
    const vendorRows = rows.filter(
        (row) => row.category === "cloud" && row.vendor === plane.vendor,
    );
    const rowsInMonth = (month: string) =>
        vendorRows.filter((row) => row.date.slice(0, 7) === month);

    if (plane.cashCoverage === "same month") {
        const matches = rowsInMonth(plane.month);
        return {
            rows: matches,
            month: plane.month,
            usd: matches.length ? cashSpendUsd(matches) : plane.cashUsd,
        };
    }

    if (plane.cashCoverage === "cash ±1mo") {
        const candidates = [
            monthShift(plane.month, 1),
            monthShift(plane.month, -1),
        ]
            .map((month) => {
                const matches = rowsInMonth(month);
                return {
                    month,
                    rows: matches,
                    usd: matches.length ? cashSpendUsd(matches) : null,
                };
            })
            .filter(
                (
                    candidate,
                ): candidate is {
                    month: string;
                    rows: OpTransactionRow[];
                    usd: number;
                } => candidate.usd != null && candidate.usd > ACTIVE_USD,
            )
            .sort((a, b) => {
                if (billedUsd == null) return b.month.localeCompare(a.month);
                return (
                    Math.abs(a.usd - billedUsd) - Math.abs(b.usd - billedUsd) ||
                    b.month.localeCompare(a.month)
                );
            });
        const best = candidates[0];
        return best
            ? { rows: best.rows, month: best.month, usd: best.usd }
            : { rows: [], month: null, usd: null };
    }

    const sameMonth = rowsInMonth(plane.month);
    return {
        rows: sameMonth,
        month: sameMonth.length ? plane.month : null,
        usd: sameMonth.length ? cashSpendUsd(sameMonth) : null,
    };
}

function dedupeEvidence(
    providerRows: OpCloudRow[],
    paymentRows: OpTransactionRow[],
): ProviderCloseEvidence[] {
    const seen = new Set<string>();
    const result: ProviderCloseEvidence[] = [];
    const add = (entry: ProviderCloseEvidence) => {
        const key = `${entry.kind}|${entry.evidence}`;
        if (!entry.evidence.trim() || seen.has(key)) return;
        seen.add(key);
        result.push(entry);
    };
    for (const row of providerRows) {
        add({
            kind: "provider",
            evidence: row.evidence,
            source: row.source,
            date: row.start.slice(0, 10),
        });
    }
    for (const row of paymentRows) {
        add({
            kind: "wise",
            evidence: row.evidence,
            source: row.source,
            date: row.date,
        });
    }
    return result;
}

export function providerCloseRows(data: Data): ProviderCloseRow[] {
    const cloudRows = data.opCloud ?? [];
    const transactionRows = data.opTransactions ?? [];
    const planeByKey = new Map(
        vendorPlanes(data).map((plane) => [
            `${plane.month}|${plane.vendor}`,
            plane,
        ]),
    );
    const productKeys = new Set<string>();
    for (const row of data.opPollen ?? []) {
        productKeys.add(`${row.month}|${row.vendor}`);
    }
    for (const row of cloudRows) {
        if (row.type !== "infra") {
            productKeys.add(`${row.start.slice(0, 7)}|${row.vendor}`);
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
    const months = [...new Set(planes.map((plane) => plane.month))];
    const providersByMonth = new Map(
        months.map((month) => [
            month,
            new Map(
                providerEconomics(data, month).map((row) => [row.vendor, row]),
            ),
        ]),
    );
    const modelsByMonth = new Map(
        months.map((month) => [month, modelEconomics(data, month)]),
    );

    return planes.map((plane) => {
        const providerRows = providerEvidenceFor(
            cloudRows,
            plane.month,
            plane.vendor,
        );
        const hasProviderEvidence = providerRows.some((row) =>
            hasArchivedEvidence(row.evidence),
        );
        const hasUsage = (data.opPollen ?? []).some(
            (row) => row.month === plane.month && row.vendor === plane.vendor,
        );
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
        });
        const provider = providersByMonth.get(plane.month)?.get(plane.vendor);
        const retainedRevenueUsd = provider?.retainedPaidUsd ?? 0;
        const payment = paymentWitnessFor(transactionRows, plane, billedUsd);
        const status = closeStatus({
            billedUsd,
            hasProviderEvidence,
            hasUsage,
            plane,
        });
        const verifiedZeroCash = hasProviderEvidence && !active(billedUsd);
        const models = (modelsByMonth.get(plane.month) ?? [])
            .filter((model) => model.vendor === plane.vendor)
            .map((model) =>
                modelCloseRow(model, hasProviderEvidence, verifiedZeroCash),
            )
            .sort(
                (a, b) =>
                    (b.netCashContributionUsd ?? -Infinity) -
                        (a.netCashContributionUsd ?? -Infinity) ||
                    b.retainedRevenueUsd - a.retainedRevenueUsd ||
                    a.model.localeCompare(b.model),
            );
        const modelPaidContribution = models.reduce<number | null>(
            (sum, model) =>
                sum == null || model.paidContributionUsd == null
                    ? null
                    : sum + model.paidContributionUsd,
            0,
        );
        const modelQuestCash = models.reduce<number | null>(
            (sum, model) =>
                sum == null || model.questCashSubsidyUsd == null
                    ? null
                    : sum + model.questCashSubsidyUsd,
            0,
        );
        const netCashContributionUsd =
            billedUsd == null ? null : retainedRevenueUsd - billedUsd;

        return {
            month: plane.month,
            vendor: plane.vendor,
            closeStatus: status,
            fundingStatus: funding,
            retainedRevenueUsd,
            billedUsd,
            creditFreeUsd,
            wiseCashUsd: payment.usd,
            wiseCashMonth: payment.month,
            cashCoverage: plane.cashCoverage,
            paidContributionUsd: modelPaidContribution,
            questCashSubsidyUsd: modelQuestCash,
            netCashContributionUsd,
            economicContributionUsd: provider?.marginUsd ?? null,
            evidence: dedupeEvidence(providerRows, payment.rows),
            models,
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
    if (row.closeStatus === "needs provider check") return 0;
    if (row.closeStatus === "needs payment match") return 1;
    if (row.closeStatus === "needs usage match") return 2;
    if (row.closeStatus === "review allocation") return 3;
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
    return {
        rows: rows.length,
        providers: new Set(rows.map((row) => row.vendor)).size,
        ready: rows.filter((row) => row.closeStatus === "ready").length,
        needsAttention: rows.filter((row) => row.closeStatus !== "ready")
            .length,
        retainedRevenueUsd: rows.reduce(
            (sum, row) => sum + row.retainedRevenueUsd,
            0,
        ),
        billedUsd: rows.reduce((sum, row) => sum + (row.billedUsd ?? 0), 0),
        creditFreeUsd: rows.reduce(
            (sum, row) => sum + (row.creditFreeUsd ?? 0),
            0,
        ),
        netCashContributionUsd: rows.reduce(
            (sum, row) => sum + (row.netCashContributionUsd ?? 0),
            0,
        ),
        unknownContributionRows: rows.filter(
            (row) => row.netCashContributionUsd == null,
        ).length,
    };
}
