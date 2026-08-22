import type {
    ModelAllocationRow,
    ModelAllocationStatus,
    ModelReconcileRow,
    ModelReconcileStatus,
} from "./modelReconcile";

export type UnitEconomicsGrain = "model" | "provider";

type EconomicsValues = Pick<
    ModelReconcileRow,
    | "meterGapUsd"
    | "netCashContributionUsd"
    | "paidContributionUsd"
    | "paidPollenOnCreditsUsd"
    | "paidPollenUsd"
    | "pollenMeterUsd"
    | "providerCashUsd"
    | "providerCreditUsd"
    | "providerUsageUsd"
    | "questCashSubsidyUsd"
    | "questPollenOnCreditsUsd"
    | "questPollenUsd"
    | "retainedPaidUsd"
>;

export type UnitEconomicsRow = EconomicsValues & {
    grain: UnitEconomicsGrain;
    month: string;
    vendor: string;
    model: string;
    sourceStatus: ModelReconcileStatus;
    allocationStatus: ModelAllocationStatus | null;
};

function economicsValues(
    row: ModelReconcileRow | ModelAllocationRow,
): EconomicsValues {
    return {
        meterGapUsd: row.meterGapUsd,
        netCashContributionUsd: row.netCashContributionUsd,
        paidContributionUsd: row.paidContributionUsd,
        paidPollenOnCreditsUsd: row.paidPollenOnCreditsUsd,
        paidPollenUsd: row.paidPollenUsd,
        pollenMeterUsd: row.pollenMeterUsd,
        providerCashUsd: row.providerCashUsd,
        providerCreditUsd: row.providerCreditUsd,
        providerUsageUsd: row.providerUsageUsd,
        questCashSubsidyUsd: row.questCashSubsidyUsd,
        questPollenOnCreditsUsd: row.questPollenOnCreditsUsd,
        questPollenUsd: row.questPollenUsd,
        retainedPaidUsd: row.retainedPaidUsd,
    };
}

export function meterMatchPct(
    pollenMeterUsd: number | null,
    providerUsageUsd: number | null,
): number | null {
    if (pollenMeterUsd == null || providerUsageUsd == null) return null;
    const pollen = Math.max(0, pollenMeterUsd);
    const provider = Math.max(0, providerUsageUsd);
    const total = Math.max(pollen, provider);
    if (total === 0) return null;
    return (Math.min(pollen, provider) / total) * 100;
}

function modelNetCash(
    parent: ModelReconcileRow,
    model: ModelAllocationRow,
): number | null {
    if (model.netCashContributionUsd != null) {
        return model.netCashContributionUsd;
    }
    if (parent.status !== "both sources" || model.status !== "unallocated") {
        return null;
    }

    // When provider spend cannot be allocated by model, keep both known sides
    // visible: retained Pollen stays with its model and cash stays on the
    // explicit unallocated row. Their sum still reconciles to the provider.
    if (model.retainedPaidUsd != null && model.providerCashUsd == null) {
        return model.retainedPaidUsd;
    }
    if (model.retainedPaidUsd == null && model.providerCashUsd != null) {
        return -model.providerCashUsd;
    }
    return null;
}

function modelMeterGap(
    parent: ModelReconcileRow,
    model: ModelAllocationRow,
): number | null {
    if (model.meterGapUsd != null) return model.meterGapUsd;
    if (
        parent.status === "both sources" &&
        model.status === "unallocated" &&
        model.providerUsageUsd != null &&
        model.paidPollenUsd == null &&
        model.questPollenUsd == null
    ) {
        return model.providerUsageUsd;
    }
    return null;
}

export function unitEconomicsRows(
    providers: readonly ModelReconcileRow[],
    grain: UnitEconomicsGrain,
): UnitEconomicsRow[] {
    if (grain === "provider") {
        return providers.map((provider) => ({
            grain,
            month: provider.month,
            vendor: provider.vendor,
            model: "All models",
            sourceStatus: provider.status,
            allocationStatus: null,
            ...economicsValues(provider),
        }));
    }

    return providers
        .flatMap((provider) =>
            provider.models.map((model) => ({
                grain,
                month: provider.month,
                vendor: provider.vendor,
                model: model.model,
                sourceStatus: provider.status,
                allocationStatus: model.status,
                ...economicsValues(model),
                meterGapUsd: modelMeterGap(provider, model),
                netCashContributionUsd: modelNetCash(provider, model),
            })),
        )
        .sort(
            (a, b) =>
                b.month.localeCompare(a.month) ||
                (b.paidPollenUsd ?? 0) +
                    (b.questPollenUsd ?? 0) -
                    ((a.paidPollenUsd ?? 0) + (a.questPollenUsd ?? 0)) ||
                (b.providerUsageUsd ?? 0) - (a.providerUsageUsd ?? 0) ||
                a.vendor.localeCompare(b.vendor) ||
                a.model.localeCompare(b.model),
        );
}
