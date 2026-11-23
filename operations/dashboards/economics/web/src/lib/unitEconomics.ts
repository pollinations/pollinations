import type { Data } from "../types";
import { type ApiCost, apiCosts, sumApiCosts } from "./apiCosts";
import {
    computeModeIndex,
    directDeliveryData,
    managedInferenceData,
    pollenComputeMode,
} from "./computeModes";
import { fmtExactUsd as fmtUsd } from "./format";
import type {
    ModelAllocationRow,
    ModelAllocationStatus,
    ModelReconcileRow,
    ModelReconcileStatus,
} from "./modelReconcile";
import { modelReconcileRows, modelReconcileSummary } from "./modelReconcile";
import {
    type MeteringBasis,
    providerMeteringBasis,
    resolveProvider,
} from "./providerRegistry";
import { isToolUsage, toolUsageRows } from "./toolUsage";
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
    // Grouped-row detail, present on model-grain rows only.
    members?: string[] | null;
    lines?: { label: string; usd: number }[] | null;
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
    row?: ModelReconcileRow | ModelAllocationRow,
): EconomicsValues {
    return {
        meterGapUsd: row?.meterGapUsd ?? null,
        netCashContributionUsd: row?.netCashContributionUsd ?? null,
        paidContributionUsd: row?.paidContributionUsd ?? null,
        paidPollenOnCreditsUsd: row?.paidPollenOnCreditsUsd ?? null,
        paidPollenUsd: row?.paidPollenUsd ?? null,
        pollenMeterUsd: row?.pollenMeterUsd ?? null,
        providerCashUsd: row?.providerCashUsd ?? null,
        providerCreditUsd: row?.providerCreditUsd ?? null,
        providerUsageUsd: row?.providerUsageUsd ?? null,
        questCashSubsidyUsd: row?.questCashSubsidyUsd ?? null,
        questPollenOnCreditsUsd: row?.questPollenOnCreditsUsd ?? null,
        questPollenUsd: row?.questPollenUsd ?? null,
        retainedPaidUsd: row?.retainedPaidUsd ?? null,
    };
}

// Infrastructure is charged to each vendor's result. The model-meter
// reconciliation still compares the direct delivery costs it can match.
export function providerEconomicsReport(data: Data, month: string) {
    const direct = unitEconomicsReport(data, month, "vendors");
    const costs = apiCosts(data, month);
    const byVendor = new Map<string, ApiCost[]>();
    for (const cost of costs) {
        const rows = byVendor.get(cost.vendor) ?? [];
        rows.push(cost);
        byVendor.set(cost.vendor, rows);
    }
    const rows = new Map(
        unitEconomicsRows(direct.vendorMonths, "provider").map((row) => [
            row.vendor,
            row,
        ]),
    );
    for (const [vendor, vendorCosts] of byVendor) {
        const infra = vendorCosts.filter(
            (cost) => cost.kind === "infrastructure",
        );
        if (!infra.length) continue;
        const row = rows.get(vendor) ?? {
            ...economicsValues(),
            grain: "provider",
            month,
            vendor,
            model: "All models",
            sourceStatus: "provider only",
            allocationStatus: null,
            economicContributionUsd: null,
        };
        const totals = sumApiCosts(infra);
        rows.set(vendor, {
            ...row,
            providerCashUsd: (row.providerCashUsd ?? 0) + totals.cashUsd,
            providerCreditUsd: (row.providerCreditUsd ?? 0) + totals.creditUsd,
            providerUsageUsd: (row.providerUsageUsd ?? 0) + totals.totalUsd,
            economicContributionUsd: subtractRecordedCost(
                row.economicContributionUsd,
                totals.totalUsd,
            ),
            netCashContributionUsd: subtractRecordedCost(
                row.netCashContributionUsd,
                totals.cashUsd,
            ),
        });
    }
    const tools = toolUsageRows(data, month);
    for (const usage of tools) {
        const row = rows.get(usage.vendor) ?? {
            ...economicsValues(),
            grain: "provider" as const,
            month,
            vendor: usage.vendor,
            model: "All models",
            sourceStatus: "pollen only" as const,
            allocationStatus: null,
            economicContributionUsd: null,
        };
        // Display observed tool consumption once. Meter calibration and funding
        // allocations remain scoped to inference/GPU; no shared-cost allocation.
        rows.set(usage.vendor, {
            ...row,
            sourceStatus:
                row.providerUsageUsd == null ? "pollen only" : "both sources",
            paidPollenUsd: (row.paidPollenUsd ?? 0) + usage.paidPollenUsd,
            questPollenUsd: (row.questPollenUsd ?? 0) + usage.questPollenUsd,
            retainedPaidUsd: (row.retainedPaidUsd ?? 0) + usage.retainedPaidUsd,
            economicContributionUsd:
                row.providerUsageUsd == null
                    ? null
                    : (row.retainedPaidUsd ?? 0) +
                      usage.retainedPaidUsd -
                      row.providerUsageUsd,
            netCashContributionUsd:
                row.providerCashUsd == null
                    ? null
                    : (row.retainedPaidUsd ?? 0) +
                      usage.retainedPaidUsd -
                      row.providerCashUsd,
        });
    }
    const toolPaid = tools.reduce((sum, row) => sum + row.paidPollenUsd, 0);
    const toolQuest = tools.reduce((sum, row) => sum + row.questPollenUsd, 0);
    const toolRetained = tools.reduce(
        (sum, row) => sum + row.retainedPaidUsd,
        0,
    );
    const missingToolCosts = tools.some(
        (usage) => rows.get(usage.vendor)?.providerUsageUsd == null,
    );
    const infrastructure = sumApiCosts(
        costs.filter((cost) => cost.kind === "infrastructure"),
    );
    return {
        ...direct,
        blockers: [
            ...direct.blockers,
            ...tools
                .filter(
                    (usage) => rows.get(usage.vendor)?.providerUsageUsd == null,
                )
                .map(
                    (usage): ResultBlocker => ({
                        month,
                        vendor: usage.vendor,
                        kind: "costs",
                        amountUsd: null,
                        message:
                            "Tool or sandbox usage is recorded, but the vendor bill is missing.",
                    }),
                ),
        ],
        rows: [...rows.values()],
        costsByVendor: byVendor,
        summary: {
            ...direct.summary,
            paidPollenUsd: direct.summary.paidPollenUsd + toolPaid,
            questPollenUsd: direct.summary.questPollenUsd + toolQuest,
            retainedPaidUsd: direct.summary.retainedPaidUsd + toolRetained,
            providerCashUsd:
                direct.summary.providerCashUsd + infrastructure.cashUsd,
            providerCreditUsd:
                direct.summary.providerCreditUsd + infrastructure.creditUsd,
            providerUsageUsd:
                direct.summary.providerUsageUsd + infrastructure.totalUsd,
            netCashContributionUsd: subtractRecordedCost(
                missingToolCosts ? null : direct.summary.netCashContributionUsd,
                infrastructure.cashUsd - toolRetained,
            ),
        },
        currentResultUsd: subtractRecordedCost(
            missingToolCosts ? null : direct.currentResultUsd,
            infrastructure.cashUsd - toolRetained,
        ),
        fullCostResultUsd: subtractRecordedCost(
            missingToolCosts ? null : direct.fullCostResultUsd,
            infrastructure.totalUsd - toolRetained,
        ),
    };
}

function subtractRecordedCost(value: number | null, cost: number) {
    return value == null ? null : value - cost;
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

// The reconciliation status compares the full provider month. Exact model costs
// can be shown independently, but do not certify that the whole invoice matches.
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

// Rows that carry provider cost no Pollen model owns.
const RESIDUAL_STATUSES = new Set<ModelAllocationStatus>([
    "unallocated",
    "needs mapping",
    "missing breakdown",
    "provider only",
]);

function isResidual(model: ModelAllocationRow): boolean {
    return RESIDUAL_STATUSES.has(model.status);
}

function modelNetCash(
    parent: ModelReconcileRow,
    model: ModelAllocationRow,
): number | null {
    if (
        model.status === "missing usage" ||
        model.status === "ambiguous allocation"
    )
        return null;
    if (model.netCashContributionUsd != null) {
        return model.netCashContributionUsd;
    }
    if (parent.status !== "both sources" || !isResidual(model)) {
        return null;
    }

    // Unknown model cost is not zero cost or a 100% margin.
    if (model.retainedPaidUsd == null && model.providerCashUsd != null) {
        return -model.providerCashUsd;
    }
    return null;
}

function modelEconomicContribution(
    parent: ModelReconcileRow,
    model: ModelAllocationRow,
): number | null {
    if (
        model.status === "missing usage" ||
        model.status === "ambiguous allocation"
    )
        return null;
    if (model.retainedPaidUsd != null && model.providerUsageUsd != null) {
        return model.retainedPaidUsd - model.providerUsageUsd;
    }
    if (parent.status !== "both sources" || !isResidual(model)) {
        return null;
    }

    // Only the residual cost itself is known; unmatched model profit is not.
    if (model.retainedPaidUsd == null && model.providerUsageUsd != null) {
        return -model.providerUsageUsd;
    }
    return null;
}

function modelMeterGap(
    parent: ModelReconcileRow,
    model: ModelAllocationRow,
): number | null {
    if (
        model.status === "missing usage" ||
        model.status === "ambiguous allocation"
    )
        return null;
    if (model.meterGapUsd != null) return model.meterGapUsd;
    if (
        parent.status === "both sources" &&
        isResidual(model) &&
        model.providerUsageUsd != null &&
        model.paidPollenUsd == null &&
        model.questPollenUsd == null
    ) {
        return model.providerUsageUsd;
    }
    return null;
}

// The situation chips above the inference table double as row filters.
export type Situation =
    | "all"
    | "assigned"
    | "grouped"
    | "missing breakdown"
    | "needs mapping"
    | "no Pollen model";

export function matchesSituation(
    row: Pick<UnitEconomicsRow, "allocationStatus" | "members">,
    situation: Situation,
): boolean {
    switch (situation) {
        case "all":
            return true;
        case "assigned":
            return row.allocationStatus === "allocated";
        case "grouped":
            return (
                row.allocationStatus === "allocated" &&
                (row.members?.length ?? 0) > 0
            );
        case "missing breakdown":
        case "needs mapping":
            return row.allocationStatus === situation;
        case "no Pollen model":
            return row.allocationStatus === "provider only";
    }
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
            members: null,
            lines: null,
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
                members: model.members ?? null,
                lines: model.lines ?? null,
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

export type UnitEconomicsView = "vendors" | "inference";
export type ResultBlocker = {
    month: string;
    vendor: string;
    kind: "costs" | "usage" | "delivery" | "period";
    message: string;
    amountUsd: number | null;
};

// Cards and reconciliation consume this same provider/month join. Model-level
// allocation and document checks do not decide whether the totals are known.
export function unitEconomicsReport(
    data: Data,
    month: string,
    view: UnitEconomicsView,
) {
    const modeIndex = computeModeIndex(data);
    const vendorMonths = modelReconcileRows(
        view === "vendors"
            ? directDeliveryData(data)
            : managedInferenceData(data, modeIndex),
    ).filter((row) => {
        if (row.month !== month) return false;
        const amounts = [
            row.paidPollenUsd,
            row.questPollenUsd,
            row.pollenMeterUsd,
            row.providerUsageUsd,
        ];
        // Keep the existing activity threshold, plus explicit zero witnesses.
        return (
            amounts.some(
                (value) => value != null && Math.abs(value) > 0.0001,
            ) ||
            (row.status === "both sources" &&
                amounts.every((value) => value === 0))
        );
    });
    const summary = modelReconcileSummary(vendorMonths);
    const blockers: ResultBlocker[] = [];
    if (view === "inference") {
        for (const row of data.opPollen ?? []) {
            if (
                row.month !== month ||
                isToolUsage(row) ||
                row.vendor === "community" ||
                resolveProvider(row.vendor)?.category === "infrastructure" ||
                (row.price_paid === 0 && row.price_quests === 0)
            )
                continue;
            const mode = pollenComputeMode(
                modeIndex,
                month,
                row.vendor,
                row.model,
            );
            if (mode !== "mixed" && mode !== "unclassified") continue;
            blockers.push({
                month,
                vendor: row.vendor,
                kind: "delivery",
                amountUsd: null,
                message: `Pollen usage cannot yet be assigned to inference or GPU: ${row.model}.`,
            });
        }
    }
    for (const row of vendorMonths) {
        if (row.status === "both sources") continue;
        // Usage awaiting a delivery split is present, not missing.
        if (
            row.status === "provider only" &&
            blockers.some(
                (blocker) =>
                    blocker.vendor === row.vendor &&
                    blocker.kind === "delivery",
            )
        )
            continue;
        const missingCosts = row.status === "pollen only";
        blockers.push({
            month,
            vendor: row.vendor,
            kind: missingCosts ? "costs" : "usage",
            message: missingCosts
                ? "Provider costs and cash/credit split are missing for recorded Pollen usage."
                : `Provider costs of ${fmtUsd(row.providerUsageUsd)} are recorded, but Pollen usage is missing. Import the usage or record verified zero activity; missing usage is not zero.`,
            amountUsd: missingCosts ? row.pollenMeterUsd : row.providerUsageUsd,
        });
    }
    if (vendorMonths.length === 0 && blockers.length === 0) {
        blockers.push({
            month,
            vendor: view === "inference" ? "Inference" : "Providers",
            kind: "period",
            amountUsd: null,
            message:
                "No provider costs or Pollen usage are recorded for this period. Import the records or record verified zero activity.",
        });
    }
    // A recorded-figures result includes every recorded cost. Absent usage
    // stays missing in the join; it is never replaced with a zero-usage row.
    const canCalculate =
        vendorMonths.some((row) => row.status === "both sources") &&
        blockers.every((blocker) => blocker.kind === "usage");
    const provisional = canCalculate && blockers.length > 0;
    return {
        modeIndex,
        vendorMonths,
        summary,
        blockers,
        provisional,
        currentResultUsd: canCalculate
            ? summary.retainedPaidUsd - summary.providerCashUsd
            : null,
        fullCostResultUsd: canCalculate
            ? summary.retainedPaidUsd - summary.providerUsageUsd
            : null,
    };
}
