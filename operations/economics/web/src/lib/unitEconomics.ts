import type {
    ModelAllocationRow,
    ModelAllocationStatus,
    ModelReconcileRow,
    ModelReconcileStatus,
} from "./modelReconcile";
import { type MeteringBasis, providerMeteringBasis } from "./providerRegistry";
import {
    CALIB_DRIFT_ABS_ALARM_USD,
    hasCalibDrift,
} from "./vendorReconciliation";

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
    economicContributionUsd: number | null;
    sourceStatus: ModelReconcileStatus;
    allocationStatus: ModelAllocationStatus | null;
};

export type ProviderCostCheckKind =
    | "healthy"
    | "review"
    | "utilization"
    | "calibration"
    | "not-applicable"
    | "missing-mapping"
    | "missing-source"
    | "provider-level";

export type ProviderCostCheck = {
    kind: ProviderCostCheckKind;
    basis: MeteringBasis;
    value: number | null;
};

export function unitPerformancePct(
    resultUsd: number | null,
    retainedPaidUsd: number | null,
): number | null {
    if (resultUsd == null || retainedPaidUsd == null || retainedPaidUsd <= 0) {
        return null;
    }
    return (resultUsd / retainedPaidUsd) * 100;
}

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

// Provider-month is the only authoritative cost-check grain. Model rows inherit
// an allocation of the provider total, so repeating a pass/fail status on every
// model would imply independent evidence that does not exist.
export function providerCostCheck(
    row: Pick<
        UnitEconomicsRow,
        | "grain"
        | "pollenMeterUsd"
        | "providerUsageUsd"
        | "sourceStatus"
        | "vendor"
    >,
): ProviderCostCheck {
    const basis = providerMeteringBasis(row.vendor);
    if (basis === "unmapped") {
        return { kind: "missing-mapping", basis, value: null };
    }
    if (row.grain === "model") {
        return { kind: "provider-level", basis, value: null };
    }
    if (
        row.sourceStatus !== "both sources" ||
        row.pollenMeterUsd == null ||
        row.providerUsageUsd == null
    ) {
        return { kind: "missing-source", basis, value: null };
    }

    const meterUsd = Math.max(0, row.pollenMeterUsd);
    const actualUsd = Math.max(0, row.providerUsageUsd);
    if (basis === "capacity") {
        return {
            kind: "utilization",
            basis,
            value: actualUsd > 0 ? (meterUsd / actualUsd) * 100 : null,
        };
    }
    if (basis === "mixed") {
        return {
            kind: "calibration",
            basis,
            value: meterUsd > 0 ? actualUsd / meterUsd : null,
        };
    }
    if (basis === "internal" || basis === "not_applicable") {
        return { kind: "not-applicable", basis, value: null };
    }

    const calibrationX = meterUsd > 0 ? actualUsd / meterUsd : null;
    const zeroMeterMaterialGap =
        meterUsd === 0 &&
        Math.abs(actualUsd - meterUsd) > CALIB_DRIFT_ABS_ALARM_USD;
    const review =
        zeroMeterMaterialGap ||
        hasCalibDrift({
            calibX: calibrationX,
            meterCloudUsd: actualUsd,
            pollenCostUsd: meterUsd,
        });
    return {
        kind: review ? "review" : "healthy",
        basis,
        value: meterMatchPct(meterUsd, actualUsd),
    };
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

function modelEconomicContribution(
    parent: ModelReconcileRow,
    model: ModelAllocationRow,
): number | null {
    if (model.retainedPaidUsd != null && model.providerUsageUsd != null) {
        return model.retainedPaidUsd - model.providerUsageUsd;
    }
    if (parent.status !== "both sources" || model.status !== "unallocated") {
        return null;
    }

    // Preserve both known sides when a mixed provider-month cannot allocate
    // cost by model. The model and explicit unallocated rows remain additive.
    if (model.retainedPaidUsd != null && model.providerUsageUsd == null) {
        return model.retainedPaidUsd;
    }
    if (model.retainedPaidUsd == null && model.providerUsageUsd != null) {
        return -model.providerUsageUsd;
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
            economicContributionUsd:
                provider.status === "both sources" &&
                provider.retainedPaidUsd != null &&
                provider.providerUsageUsd != null
                    ? provider.retainedPaidUsd - provider.providerUsageUsd
                    : null,
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
                economicContributionUsd: modelEconomicContribution(
                    provider,
                    model,
                ),
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
