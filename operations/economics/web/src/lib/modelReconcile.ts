import type { Data, OpCloudRow } from "../types";
import { cloudCategory } from "./categories";
import {
    opCloudCreditBurnUsd,
    opCloudMonth,
    opCloudPaidBurnUsd,
} from "./computeLedger";
import { toUsd } from "./fx";
import { resolveLedgerLabel } from "./modelIdentity";
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

// Residual statuses carry provider cost that no Pollen model row owns.
export type ModelAllocationStatus =
    | "allocated"
    | "missing provider"
    | "unallocated"
    | "needs mapping"
    | "shared upstream"
    | "missing breakdown"
    | "provider only"
    | "shared member";

// Residual cost by reason, per vendor month.
export type ResidualBuckets = {
    allocatedUsd: number;
    billedTogetherUsd: number;
    missingBreakdownUsd: number;
    needsMappingUsd: number;
    providerOnlyUsd: number;
};

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
    // For a member of a billed-together group: the group row's name.
    group?: string;
    // For a billed-together row: the provider billing lines it sums.
    lines?: { label: string; usd: number }[];
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
    buckets: ResidualBuckets;
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
    buckets: ResidualBuckets;
};

type PollenModel = {
    model: string;
    paidPollenUsd: number;
    questPollenUsd: number;
    retainedPaidUsd: number;
    paidMeterUsd: number;
    questMeterUsd: number;
};

type Funding = { cashUsd: number; creditUsd: number };

type ProviderMonth = {
    month: string;
    vendor: string;
    pollenModels: Map<string, PollenModel>;
    hasPollen: boolean;
    hasProvider: boolean;
    cashUsd: number;
    creditUsd: number;
    providerModels: Map<string, Funding>;
    // Provider lines billed for several Pollen models of one upstream, keyed
    // by the model set, with the billing lines they sum.
    sharedGroups: Map<
        string,
        Funding & { models: string[]; lines: Map<string, number> }
    >;
    // Reviewed labels with no Pollen model at all, keyed by label.
    providerOnlyLabels: Map<string, Funding>;
    unmapped: Funding;
    blank: Funding;
};

function emptyFunding(): Funding {
    return { cashUsd: 0, creditUsd: 0 };
}

function addFunding(target: Funding, cashUsd: number, creditUsd: number) {
    target.cashUsd += cashUsd;
    target.creditUsd += creditUsd;
}

function hasFunding(funding: Funding): boolean {
    return Math.abs(funding.cashUsd) + Math.abs(funding.creditUsd) > ACTIVE_USD;
}

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
        providerModels: new Map(),
        sharedGroups: new Map(),
        providerOnlyLabels: new Map(),
        unmapped: emptyFunding(),
        blank: emptyFunding(),
    }));
}

// A positive credit row records a grant award, not usage in that month. It
// must not make a grant-only provider-month look like a checked zero bill.
function isProviderUsageWitness(row: OpCloudRow): boolean {
    return (
        cloudCategory(row) === "compute" && !(row.credit > 0 && row.paid === 0)
    );
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

function modelFundingAllocation(
    model: PollenModel,
    funding: { cashUsd: number; creditUsd: number },
): ModelAllocationRow {
    const meterUsd = pollenMeterUsd(model);
    const paidWeight =
        meterUsd > ACTIVE_USD ? Math.max(0, model.paidMeterUsd) / meterUsd : 0;
    const questWeight =
        meterUsd > ACTIVE_USD ? Math.max(0, model.questMeterUsd) / meterUsd : 0;
    const paidCashUsd = funding.cashUsd * paidWeight;
    const questCashUsd = funding.cashUsd * questWeight;
    const paidCreditUsd = funding.creditUsd * paidWeight;
    const questCreditUsd = funding.creditUsd * questWeight;
    const providerUsageUsd = funding.cashUsd + funding.creditUsd;
    const creditShare =
        providerUsageUsd > ACTIVE_USD
            ? Math.min(1, Math.max(0, funding.creditUsd / providerUsageUsd))
            : 0;

    return {
        model: model.model,
        status: "allocated",
        paidPollenUsd: model.paidPollenUsd,
        questPollenUsd: model.questPollenUsd,
        retainedPaidUsd: model.retainedPaidUsd,
        pollenMeterUsd: meterUsd,
        providerCashUsd: funding.cashUsd,
        providerCreditUsd: funding.creditUsd,
        providerUsageUsd,
        paidProviderCashUsd: paidCashUsd,
        questProviderCashUsd: questCashUsd,
        paidProviderCreditUsd: paidCreditUsd,
        questProviderCreditUsd: questCreditUsd,
        paidPollenOnCreditsUsd: model.paidPollenUsd * creditShare,
        questPollenOnCreditsUsd: model.questPollenUsd * creditShare,
        meterGapUsd: providerUsageUsd - meterUsd,
        paidContributionUsd: model.retainedPaidUsd - paidCashUsd,
        questCashSubsidyUsd: questCashUsd,
        netCashContributionUsd:
            model.retainedPaidUsd - paidCashUsd - questCashUsd,
    };
}

// Provider cost that no Pollen model row owns. It stays visible under the
// reason it could not be joined instead of being spread across models.
function residualRow(
    model: string,
    status: ModelAllocationStatus,
    funding: Funding,
): ModelAllocationRow {
    return {
        model,
        status,
        paidPollenUsd: null,
        questPollenUsd: null,
        retainedPaidUsd: null,
        pollenMeterUsd: null,
        ...nullFundingFields(),
        providerCashUsd: funding.cashUsd,
        providerCreditUsd: funding.creditUsd,
        providerUsageUsd: funding.cashUsd + funding.creditUsd,
    };
}

function emptyBuckets(): ResidualBuckets {
    return {
        allocatedUsd: 0,
        billedTogetherUsd: 0,
        missingBreakdownUsd: 0,
        needsMappingUsd: 0,
        providerOnlyUsd: 0,
    };
}

export function residualBuckets(
    models: readonly ModelAllocationRow[],
): ResidualBuckets {
    const buckets = emptyBuckets();
    for (const model of models) {
        const usd = model.providerUsageUsd ?? 0;
        switch (model.status) {
            case "allocated":
                buckets.allocatedUsd += usd;
                break;
            case "shared upstream":
                buckets.billedTogetherUsd += usd;
                break;
            case "missing breakdown":
                buckets.missingBreakdownUsd += usd;
                break;
            case "needs mapping":
                buckets.needsMappingUsd += usd;
                break;
            case "provider only":
                buckets.providerOnlyUsd += usd;
                break;
            default:
                break;
        }
    }
    return buckets;
}

function allocationRows(entry: ProviderMonth): ModelAllocationRow[] {
    const memberGroup = new Map<string, string>();
    for (const [key, group] of entry.sharedGroups) {
        for (const model of group.models) memberGroup.set(model, key);
    }
    const models = [...entry.pollenModels.values()].map(
        (model): ModelAllocationRow => {
            const funding = entry.providerModels.get(model.model);
            if (funding) return modelFundingAllocation(model, funding);
            const group = memberGroup.get(model.model);
            return {
                model: model.model,
                status: group
                    ? "shared member"
                    : entry.hasProvider
                      ? "unallocated"
                      : "missing provider",
                paidPollenUsd: model.paidPollenUsd,
                questPollenUsd: model.questPollenUsd,
                retainedPaidUsd: model.retainedPaidUsd,
                pollenMeterUsd: pollenMeterUsd(model),
                ...nullFundingFields(),
                ...(group ? { group } : {}),
            };
        },
    );
    // A ledger line with no cash and no credit (for example a corrected fact
    // re-appended at zero) records no usage and is not a residual.
    for (const [model, funding] of entry.providerModels) {
        if (!entry.pollenModels.has(model) && hasFunding(funding)) {
            models.push(residualRow(model, "provider only", funding));
        }
    }
    for (const [label, funding] of entry.providerOnlyLabels) {
        if (!hasFunding(funding)) continue;
        models.push(residualRow(label, "provider only", funding));
    }
    for (const [key, group] of entry.sharedGroups) {
        if (!hasFunding(group)) continue;
        models.push({
            ...residualRow(key, "shared upstream", group),
            lines: [...group.lines].map(([label, usd]) => ({ label, usd })),
        });
    }
    if (hasFunding(entry.unmapped)) {
        models.push(
            residualRow("Needs model mapping", "needs mapping", entry.unmapped),
        );
    }
    if (hasFunding(entry.blank)) {
        models.push(
            residualRow(
                "Missing cost breakdown",
                "missing breakdown",
                entry.blank,
            ),
        );
    }
    if (entry.hasProvider && models.length === 0) {
        models.push(residualRow("No Pollen usage", "provider only", entry));
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

// Join provider labels to Pollen models only by exact Pollen id or through the
// reviewed label table. Keep unmatched costs separate; a missing model must
// never redistribute another model's costs.
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
        const cashUsd = opCloudPaidBurnUsd(row);
        const creditUsd = opCloudCreditBurnUsd(row);
        entry.cashUsd += cashUsd;
        entry.creditUsd += creditUsd;
        // A label that is exactly a Pollen model id metered this month is an
        // exact join, whether or not today's registry still lists it.
        const label = row.model.trim();
        let resolution = entry.pollenModels.has(label)
            ? ({ kind: "model", model: label } as const)
            : resolveLedgerLabel(entry.vendor, label, {
                  sku: row.resource_sku,
                  name: row.resource_name,
                  month,
              });
        // A label listed for several models is shared only in a month where
        // more than one of them was actually metered on this vendor.
        if (resolution.kind === "shared") {
            const metered = resolution.models.filter((model) =>
                entry.pollenModels.has(model),
            );
            if (metered.length === 1) {
                resolution = { kind: "model", model: metered[0] };
            } else if (metered.length > 1) {
                resolution = { kind: "shared", models: metered };
            }
        }
        switch (resolution.kind) {
            case "model":
                addFunding(
                    getOrInit(
                        entry.providerModels,
                        resolution.model,
                        emptyFunding,
                    ),
                    cashUsd,
                    creditUsd,
                );
                break;
            case "shared": {
                const group = getOrInit(
                    entry.sharedGroups,
                    resolution.models.join(" + "),
                    () => ({
                        ...emptyFunding(),
                        models: resolution.models,
                        lines: new Map<string, number>(),
                    }),
                );
                addFunding(group, cashUsd, creditUsd);
                group.lines.set(
                    label,
                    (group.lines.get(label) ?? 0) + cashUsd + creditUsd,
                );
                break;
            }
            case "provider-only":
                addFunding(
                    getOrInit(
                        entry.providerOnlyLabels,
                        resolution.label,
                        emptyFunding,
                    ),
                    cashUsd,
                    creditUsd,
                );
                break;
            case "unmapped":
                addFunding(entry.unmapped, cashUsd, creditUsd);
                break;
            case "blank":
                addFunding(entry.blank, cashUsd, creditUsd);
                break;
        }
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
            const models = allocationRows(entry);
            const sumModelField = (
                field:
                    | "paidProviderCashUsd"
                    | "questProviderCashUsd"
                    | "paidProviderCreditUsd"
                    | "questProviderCreditUsd"
                    | "paidPollenOnCreditsUsd"
                    | "questPollenOnCreditsUsd"
                    | "paidContributionUsd"
                    | "questCashSubsidyUsd",
            ): number | null => {
                if (!both || models.some((model) => model[field] == null)) {
                    return null;
                }
                return models.reduce(
                    (sum, model) => sum + (model[field] ?? 0),
                    0,
                );
            };
            const paidProviderCashUsd = sumModelField("paidProviderCashUsd");
            const questProviderCashUsd = sumModelField("questProviderCashUsd");
            const creditShare = fundingCreditShare(entry);
            const paidPollenOnCreditsUsd = sumModelField(
                "paidPollenOnCreditsUsd",
            );
            const questPollenOnCreditsUsd = sumModelField(
                "questPollenOnCreditsUsd",
            );
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
                paidProviderCashUsd,
                questProviderCashUsd,
                paidProviderCreditUsd: sumModelField("paidProviderCreditUsd"),
                questProviderCreditUsd: sumModelField("questProviderCreditUsd"),
                paidPollenOnCreditsUsd:
                    paidPollenOnCreditsUsd ??
                    (both && creditShare != null && paidPollenUsd != null
                        ? paidPollenUsd * creditShare
                        : null),
                questPollenOnCreditsUsd:
                    questPollenOnCreditsUsd ??
                    (both && creditShare != null && questPollenUsd != null
                        ? questPollenUsd * creditShare
                        : null),
                meterGapUsd:
                    both && pollenMeterUsd != null && providerUsageUsd != null
                        ? providerUsageUsd - pollenMeterUsd
                        : null,
                paidContributionUsd: sumModelField("paidContributionUsd"),
                questCashSubsidyUsd: sumModelField("questCashSubsidyUsd"),
                netCashContributionUsd:
                    both && retainedPaidUsd != null && providerCashUsd != null
                        ? retainedPaidUsd - providerCashUsd
                        : null,
                models,
                buckets: residualBuckets(models),
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
        buckets: emptyBuckets(),
    };

    for (const row of rows) {
        for (const key of Object.keys(
            summary.buckets,
        ) as (keyof ResidualBuckets)[]) {
            summary.buckets[key] += row.buckets[key];
        }
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
