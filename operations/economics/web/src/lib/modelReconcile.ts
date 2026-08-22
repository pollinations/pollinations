import type { Data, OpCloudRow } from "../types";
import { toUsd } from "./fx";
import {
    opCloudCreditBurnUsd,
    opCloudMonth,
    opCloudPaidBurnUsd,
} from "./insights";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
    WINDOW_START,
} from "./months";
import { canonicalVendor } from "./tb";

const ACTIVE_USD = 0.0001;
const MONTH_KEY = /^\d{4}-\d{2}$/;

export type ModelAllocationStatus =
    | "allocated"
    | "missing provider"
    | "unallocated";

export type ModelAllocationRow = {
    model: string;
    status: ModelAllocationStatus;
    paidPollenUsd: number | null;
    questPollenUsd: number | null;
    retainedPaidUsd: number | null;
    pollenMeterUsd: number | null;
    providerCashUsd: number | null;
    providerCreditUsd: number | null;
    providerUsageUsd: number | null;
    paidProviderCashUsd: number | null;
    questProviderCashUsd: number | null;
    paidProviderCreditUsd: number | null;
    questProviderCreditUsd: number | null;
    paidPollenOnCreditsUsd: number | null;
    questPollenOnCreditsUsd: number | null;
    meterGapUsd: number | null;
    paidContributionUsd: number | null;
    questCashSubsidyUsd: number | null;
    netCashContributionUsd: number | null;
};

export type ModelReconcileStatus =
    | "both sources"
    | "pollen only"
    | "provider only";

export type ModelReconcileRow = {
    month: string;
    vendor: string;
    status: ModelReconcileStatus;
    paidPollenUsd: number | null;
    questPollenUsd: number | null;
    retainedPaidUsd: number | null;
    pollenMeterUsd: number | null;
    providerCashUsd: number | null;
    providerCreditUsd: number | null;
    providerUsageUsd: number | null;
    paidProviderCashUsd: number | null;
    questProviderCashUsd: number | null;
    paidProviderCreditUsd: number | null;
    questProviderCreditUsd: number | null;
    paidPollenOnCreditsUsd: number | null;
    questPollenOnCreditsUsd: number | null;
    meterGapUsd: number | null;
    paidContributionUsd: number | null;
    questCashSubsidyUsd: number | null;
    netCashContributionUsd: number | null;
    models: ModelAllocationRow[];
};

export type ModelReconcileSummary = {
    providerMonths: number;
    missingSideProviderMonths: number;
    paidPollenUsd: number;
    questPollenUsd: number;
    retainedPaidUsd: number;
    pollenMeterUsd: number;
    providerCashUsd: number;
    providerCreditUsd: number;
    providerUsageUsd: number;
    paidPollenOnCreditsUsd: number | null;
    questPollenOnCreditsUsd: number | null;
    paidPollenUnknownFundingUsd: number;
    questPollenUnknownFundingUsd: number;
    meterGapUsd: number | null;
    paidContributionUsd: number | null;
    questCashSubsidyUsd: number | null;
    netCashContributionUsd: number | null;
    pollenOnlyMeterUsd: number;
    providerOnlyUsageUsd: number;
};

type PollenModel = {
    model: string;
    paidPollenUsd: number;
    questPollenUsd: number;
    retainedPaidUsd: number;
    paidMeterUsd: number;
    questMeterUsd: number;
};

type ProviderMonth = {
    month: string;
    vendor: string;
    pollenModels: Map<string, PollenModel>;
    hasPollen: boolean;
    hasProvider: boolean;
    cashUsd: number;
    creditUsd: number;
};

function getOrInit<K, V>(map: Map<K, V>, key: K, make: () => V): V {
    const current = map.get(key);
    if (current !== undefined) return current;
    const value = make();
    map.set(key, value);
    return value;
}

function providerMonth(
    rows: Map<string, ProviderMonth>,
    month: string,
    vendor: string,
): ProviderMonth {
    const canonical = canonicalVendor(vendor.trim());
    return getOrInit(rows, `${month}|${canonical}`, () => ({
        month,
        vendor: canonical,
        pollenModels: new Map(),
        hasPollen: false,
        hasProvider: false,
        cashUsd: 0,
        creditUsd: 0,
    }));
}

// A positive credit row records a grant award, not usage in that month. It
// must not make a grant-only provider-month look like a checked zero bill.
function isProviderUsageWitness(row: OpCloudRow): boolean {
    return row.type !== "infra" && !(row.credit > 0 && row.paid === 0);
}

function pollenMeterUsd(model: PollenModel): number {
    return model.paidMeterUsd + model.questMeterUsd;
}

function fundingCreditShare(entry: ProviderMonth): number | null {
    if (!entry.hasProvider) return null;
    if (entry.creditUsd <= ACTIVE_USD) return 0;
    const usageUsd = entry.cashUsd + entry.creditUsd;
    if (usageUsd <= ACTIVE_USD) return null;
    return Math.min(1, Math.max(0, entry.creditUsd / usageUsd));
}

type FundingAllocation = {
    paidCashUsd: number;
    questCashUsd: number;
    paidCreditUsd: number;
    questCreditUsd: number;
};

function fundingAllocation(
    entry: ProviderMonth,
    paidWeight: number,
    questWeight: number,
): FundingAllocation {
    return {
        paidCashUsd: entry.cashUsd * paidWeight,
        questCashUsd: entry.cashUsd * questWeight,
        paidCreditUsd: entry.creditUsd * paidWeight,
        questCreditUsd: entry.creditUsd * questWeight,
    };
}

function nullFundingFields() {
    return {
        providerCashUsd: null,
        providerCreditUsd: null,
        providerUsageUsd: null,
        paidProviderCashUsd: null,
        questProviderCashUsd: null,
        paidProviderCreditUsd: null,
        questProviderCreditUsd: null,
        paidPollenOnCreditsUsd: null,
        questPollenOnCreditsUsd: null,
        meterGapUsd: null,
        paidContributionUsd: null,
        questCashSubsidyUsd: null,
        netCashContributionUsd: null,
    };
}

function allocationRows(entry: ProviderMonth): ModelAllocationRow[] {
    const pollenModels = [...entry.pollenModels.values()];
    const totalWeight = pollenModels.reduce(
        (sum, model) => sum + Math.max(0, pollenMeterUsd(model)),
        0,
    );
    const providerUsage = entry.cashUsd + entry.creditUsd;
    const canAllocate =
        entry.hasProvider &&
        (totalWeight > ACTIVE_USD || Math.abs(providerUsage) <= ACTIVE_USD);

    const models = pollenModels.map((model): ModelAllocationRow => {
        const meterUsd = pollenMeterUsd(model);
        const pollenFields = {
            paidPollenUsd: model.paidPollenUsd,
            questPollenUsd: model.questPollenUsd,
            retainedPaidUsd: model.retainedPaidUsd,
            pollenMeterUsd: meterUsd,
        };
        if (!entry.hasProvider) {
            return {
                model: model.model,
                status: "missing provider",
                ...pollenFields,
                ...nullFundingFields(),
            };
        }

        if (!canAllocate) {
            const creditShare = fundingCreditShare(entry);
            return {
                model: model.model,
                status: "unallocated",
                ...pollenFields,
                ...nullFundingFields(),
                paidPollenOnCreditsUsd:
                    creditShare == null
                        ? null
                        : model.paidPollenUsd * creditShare,
                questPollenOnCreditsUsd:
                    creditShare == null
                        ? null
                        : model.questPollenUsd * creditShare,
                meterGapUsd: null,
            };
        }

        const paidWeight =
            totalWeight > ACTIVE_USD
                ? Math.max(0, model.paidMeterUsd) / totalWeight
                : 0;
        const questWeight =
            totalWeight > ACTIVE_USD
                ? Math.max(0, model.questMeterUsd) / totalWeight
                : 0;
        const allocation = fundingAllocation(entry, paidWeight, questWeight);
        const cash = allocation.paidCashUsd + allocation.questCashUsd;
        const credit = allocation.paidCreditUsd + allocation.questCreditUsd;
        const creditShare = fundingCreditShare(entry);
        return {
            model: model.model,
            status: "allocated",
            ...pollenFields,
            providerCashUsd: cash,
            providerCreditUsd: credit,
            providerUsageUsd: cash + credit,
            paidProviderCashUsd: allocation.paidCashUsd,
            questProviderCashUsd: allocation.questCashUsd,
            paidProviderCreditUsd: allocation.paidCreditUsd,
            questProviderCreditUsd: allocation.questCreditUsd,
            paidPollenOnCreditsUsd:
                creditShare == null ? null : model.paidPollenUsd * creditShare,
            questPollenOnCreditsUsd:
                creditShare == null ? null : model.questPollenUsd * creditShare,
            meterGapUsd: cash + credit - meterUsd,
            paidContributionUsd: model.retainedPaidUsd - allocation.paidCashUsd,
            questCashSubsidyUsd: allocation.questCashUsd,
            netCashContributionUsd:
                model.retainedPaidUsd -
                allocation.paidCashUsd -
                allocation.questCashUsd,
        };
    });

    if (
        entry.hasProvider &&
        (!entry.hasPollen ||
            (!canAllocate && Math.abs(providerUsage) > ACTIVE_USD))
    ) {
        models.push({
            model: "Unallocated provider usage",
            status: "unallocated",
            paidPollenUsd: null,
            questPollenUsd: null,
            retainedPaidUsd: null,
            pollenMeterUsd: null,
            providerCashUsd: entry.cashUsd,
            providerCreditUsd: entry.creditUsd,
            providerUsageUsd: providerUsage,
            paidProviderCashUsd: null,
            questProviderCashUsd: null,
            paidProviderCreditUsd: null,
            questProviderCreditUsd: null,
            paidPollenOnCreditsUsd: null,
            questPollenOnCreditsUsd: null,
            meterGapUsd: null,
            paidContributionUsd: null,
            questCashSubsidyUsd: null,
            netCashContributionUsd: null,
        });
    }

    return models.sort(
        (a, b) =>
            (b.paidPollenUsd ?? 0) +
                (b.questPollenUsd ?? 0) -
                ((a.paidPollenUsd ?? 0) + (a.questPollenUsd ?? 0)) ||
            (b.providerUsageUsd ?? 0) - (a.providerUsageUsd ?? 0) ||
            a.model.localeCompare(b.model),
    );
}

// Provider-month is the trusted reconciliation grain. Provider model labels
// are intentionally not joined to our registry model IDs; provider totals are
// allocated to Pollen models by their share of metered cost.
export function modelReconcileRows(data: Data): ModelReconcileRow[] {
    const entries = new Map<string, ProviderMonth>();

    for (const row of data.opPollen ?? []) {
        if (!MONTH_KEY.test(row.month) || row.month < WINDOW_START) continue;
        const entry = providerMonth(entries, row.month, row.vendor);
        entry.hasPollen = true;
        const modelName = row.model.trim() || "Unassigned Pollen model";
        const model = getOrInit(entry.pollenModels, modelName, () => ({
            model: modelName,
            paidPollenUsd: 0,
            questPollenUsd: 0,
            retainedPaidUsd: 0,
            paidMeterUsd: 0,
            questMeterUsd: 0,
        }));
        model.paidPollenUsd += toUsd(row.price_paid, row.currency, row.month);
        model.questPollenUsd += toUsd(
            row.price_quests,
            row.currency,
            row.month,
        );
        model.retainedPaidUsd += toUsd(
            row.price_paid - row.byop_paid - row.model_paid,
            row.currency,
            row.month,
        );
        model.paidMeterUsd += toUsd(row.cost_paid, row.currency, row.month);
        model.questMeterUsd += toUsd(row.cost_quests, row.currency, row.month);
    }

    for (const row of data.opCloud ?? []) {
        const month = opCloudMonth(row);
        if (
            !MONTH_KEY.test(month) ||
            month < WINDOW_START ||
            !isProviderUsageWitness(row)
        ) {
            continue;
        }
        const entry = providerMonth(entries, month, row.vendor);
        entry.hasProvider = true;
        entry.cashUsd += opCloudPaidBurnUsd(row);
        entry.creditUsd += opCloudCreditBurnUsd(row);
    }

    return [...entries.values()]
        .map((entry): ModelReconcileRow => {
            const pollenModels = [...entry.pollenModels.values()];
            const paidPollenUsd = entry.hasPollen
                ? pollenModels.reduce(
                      (sum, model) => sum + model.paidPollenUsd,
                      0,
                  )
                : null;
            const questPollenUsd = entry.hasPollen
                ? pollenModels.reduce(
                      (sum, model) => sum + model.questPollenUsd,
                      0,
                  )
                : null;
            const retainedPaidUsd = entry.hasPollen
                ? pollenModels.reduce(
                      (sum, model) => sum + model.retainedPaidUsd,
                      0,
                  )
                : null;
            const paidMeterUsd = entry.hasPollen
                ? pollenModels.reduce(
                      (sum, model) => sum + model.paidMeterUsd,
                      0,
                  )
                : null;
            const questMeterUsd = entry.hasPollen
                ? pollenModels.reduce(
                      (sum, model) => sum + model.questMeterUsd,
                      0,
                  )
                : null;
            const pollenMeterUsd = entry.hasPollen
                ? (paidMeterUsd ?? 0) + (questMeterUsd ?? 0)
                : null;
            const providerCashUsd = entry.hasProvider ? entry.cashUsd : null;
            const providerCreditUsd = entry.hasProvider
                ? entry.creditUsd
                : null;
            const providerUsageUsd = entry.hasProvider
                ? entry.cashUsd + entry.creditUsd
                : null;
            const both = entry.hasPollen && entry.hasProvider;
            const canSplitFunding =
                both &&
                (Math.max(0, pollenMeterUsd ?? 0) > ACTIVE_USD ||
                    Math.abs(providerUsageUsd ?? 0) <= ACTIVE_USD);
            const allocationDenominator =
                (pollenMeterUsd ?? 0) > ACTIVE_USD ? (pollenMeterUsd ?? 0) : 1;
            const allocation = canSplitFunding
                ? fundingAllocation(
                      entry,
                      (paidMeterUsd ?? 0) / allocationDenominator,
                      (questMeterUsd ?? 0) / allocationDenominator,
                  )
                : null;
            const creditShare = fundingCreditShare(entry);
            return {
                month: entry.month,
                vendor: entry.vendor,
                status: both
                    ? "both sources"
                    : entry.hasPollen
                      ? "pollen only"
                      : "provider only",
                paidPollenUsd,
                questPollenUsd,
                retainedPaidUsd,
                pollenMeterUsd,
                providerCashUsd,
                providerCreditUsd,
                providerUsageUsd,
                paidProviderCashUsd: allocation?.paidCashUsd ?? null,
                questProviderCashUsd: allocation?.questCashUsd ?? null,
                paidProviderCreditUsd: allocation?.paidCreditUsd ?? null,
                questProviderCreditUsd: allocation?.questCreditUsd ?? null,
                paidPollenOnCreditsUsd:
                    both && creditShare != null && paidPollenUsd != null
                        ? paidPollenUsd * creditShare
                        : null,
                questPollenOnCreditsUsd:
                    both && creditShare != null && questPollenUsd != null
                        ? questPollenUsd * creditShare
                        : null,
                meterGapUsd:
                    both && pollenMeterUsd != null && providerUsageUsd != null
                        ? providerUsageUsd - pollenMeterUsd
                        : null,
                paidContributionUsd:
                    retainedPaidUsd != null && allocation != null
                        ? retainedPaidUsd - allocation.paidCashUsd
                        : null,
                questCashSubsidyUsd: allocation?.questCashUsd ?? null,
                netCashContributionUsd:
                    both && retainedPaidUsd != null && providerCashUsd != null
                        ? retainedPaidUsd - providerCashUsd
                        : null,
                models: allocationRows(entry),
            };
        })
        .sort(
            (a, b) =>
                b.month.localeCompare(a.month) ||
                a.vendor.localeCompare(b.vendor),
        );
}

export function visibleModelReconcileRows({
    month,
    rows,
    vendor,
}: {
    month: MonthFilterValue;
    rows: ModelReconcileRow[];
    vendor: ValueFilter;
}): ModelReconcileRow[] {
    return rows.filter(
        (row) =>
            matchesMonth(row.month, month) && matchesValue(row.vendor, vendor),
    );
}

export function modelReconcileProviderOptions(
    data: Data,
    month: MonthFilterValue = "",
): string[] {
    const vendors = new Set(
        modelReconcileRows(data)
            .filter((row) => matchesMonth(row.month, month))
            .map((row) => row.vendor),
    );
    return ["all", ...[...vendors].sort((a, b) => a.localeCompare(b))];
}

export function modelReconcileSummary(
    rows: ModelReconcileRow[],
): ModelReconcileSummary {
    let matchedRows = 0;
    let creditBackingRows = 0;
    let splitFundingRows = 0;
    const summary: ModelReconcileSummary = {
        providerMonths: rows.length,
        missingSideProviderMonths: 0,
        paidPollenUsd: 0,
        questPollenUsd: 0,
        retainedPaidUsd: 0,
        pollenMeterUsd: 0,
        providerCashUsd: 0,
        providerCreditUsd: 0,
        providerUsageUsd: 0,
        paidPollenOnCreditsUsd: null,
        questPollenOnCreditsUsd: null,
        paidPollenUnknownFundingUsd: 0,
        questPollenUnknownFundingUsd: 0,
        meterGapUsd: null,
        paidContributionUsd: null,
        questCashSubsidyUsd: null,
        netCashContributionUsd: null,
        pollenOnlyMeterUsd: 0,
        providerOnlyUsageUsd: 0,
    };

    for (const row of rows) {
        summary.paidPollenUsd += row.paidPollenUsd ?? 0;
        summary.questPollenUsd += row.questPollenUsd ?? 0;
        summary.retainedPaidUsd += row.retainedPaidUsd ?? 0;
        summary.pollenMeterUsd += row.pollenMeterUsd ?? 0;
        summary.providerCashUsd += row.providerCashUsd ?? 0;
        summary.providerCreditUsd += row.providerCreditUsd ?? 0;
        summary.providerUsageUsd += row.providerUsageUsd ?? 0;

        if (
            row.paidPollenOnCreditsUsd != null &&
            row.questPollenOnCreditsUsd != null
        ) {
            creditBackingRows += 1;
            summary.paidPollenOnCreditsUsd =
                (summary.paidPollenOnCreditsUsd ?? 0) +
                row.paidPollenOnCreditsUsd;
            summary.questPollenOnCreditsUsd =
                (summary.questPollenOnCreditsUsd ?? 0) +
                row.questPollenOnCreditsUsd;
        } else if (row.paidPollenUsd != null) {
            summary.paidPollenUnknownFundingUsd += row.paidPollenUsd ?? 0;
            summary.questPollenUnknownFundingUsd += row.questPollenUsd ?? 0;
        }

        if (row.status === "both sources") {
            matchedRows += 1;
            summary.meterGapUsd =
                (summary.meterGapUsd ?? 0) + (row.meterGapUsd ?? 0);
            summary.netCashContributionUsd =
                (summary.netCashContributionUsd ?? 0) +
                (row.netCashContributionUsd ?? 0);
            if (
                row.paidContributionUsd != null &&
                row.questCashSubsidyUsd != null
            ) {
                splitFundingRows += 1;
                summary.paidContributionUsd =
                    (summary.paidContributionUsd ?? 0) +
                    row.paidContributionUsd;
                summary.questCashSubsidyUsd =
                    (summary.questCashSubsidyUsd ?? 0) +
                    row.questCashSubsidyUsd;
            }
            continue;
        }

        summary.missingSideProviderMonths += 1;
        if (row.status === "pollen only") {
            summary.pollenOnlyMeterUsd += row.pollenMeterUsd ?? 0;
        } else {
            summary.providerOnlyUsageUsd += row.providerUsageUsd ?? 0;
        }
    }

    if (matchedRows === 0) {
        summary.meterGapUsd = null;
        summary.netCashContributionUsd = null;
    }
    if (creditBackingRows === 0) {
        summary.paidPollenOnCreditsUsd = null;
        summary.questPollenOnCreditsUsd = null;
    }
    if (splitFundingRows === 0) {
        summary.paidContributionUsd = null;
        summary.questCashSubsidyUsd = null;
    }
    return summary;
}
