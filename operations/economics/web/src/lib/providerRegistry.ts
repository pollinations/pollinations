import registryJson from "../../../provider-registry.json";
import type {
    Data,
    EconomicsPrivateConfig,
    MeterDriftExplanation,
    OpCloudRow,
    PollenWitnessExplanation,
    ProviderCheckExplanation,
    ProviderObservation,
    ProviderObservationSource,
} from "../types";
import {
    isComputeOrInfrastructureCategory,
    transactionCategory,
} from "./categories";
import { collectMonths, type MonthFilterValue, matchesMonth } from "./months";

export type ProviderDefinition = {
    id: string;
    label: string;
    meteringBasis: MeteringBasis;
    aliases: string[];
    connector: string | null;
    monthlyReview: boolean;
    balanceTracking: boolean;
    collectionMethod: ProviderCollectionMethod | null;
    access?: ProviderAccessTarget[];
    accounts?: ProviderAccountDefinition[];
};

export type ProviderCollectionMethod = "api" | "cli" | "dashboard" | "internal";

export type ProviderAccessTarget = {
    workspace: string;
    url: string;
    accountId?: string;
};

export type MeteringBasis =
    | "direct"
    | "capacity"
    | "mixed"
    | "internal"
    | "not_applicable"
    | "unmapped";

export type ProviderAccountDefinition = {
    id: string;
    label: string;
    activeFrom: string;
    activeTo: string | null;
};

type ProviderRegistryFile = {
    version: number;
    providers: ProviderDefinition[];
};

export type ProviderReconciliationExplanation =
    | PollenWitnessExplanation
    | MeterDriftExplanation;

export const PROVIDER_REGISTRY = (registryJson as ProviderRegistryFile)
    .providers;
const providerByAlias = new Map<string, ProviderDefinition>();
for (const provider of PROVIDER_REGISTRY) {
    providerByAlias.set(provider.id, provider);
    for (const alias of provider.aliases) providerByAlias.set(alias, provider);
}

export function normalizeProviderName(value: string): string {
    return value.trim().toLowerCase();
}

export function resolveProvider(value: string): ProviderDefinition | undefined {
    return providerByAlias.get(normalizeProviderName(value));
}

export function providerMeteringBasis(value: string): MeteringBasis {
    const provider = resolveProvider(value);
    return provider?.meteringBasis ?? "unmapped";
}

export function activeProviderAccounts(
    provider: ProviderDefinition,
    month: string,
): ProviderAccountDefinition[] {
    return (provider.accounts ?? []).filter(
        (account) =>
            account.activeFrom <= month &&
            (account.activeTo == null || account.activeTo >= month),
    );
}

// Unknown names deliberately pass through unchanged. They remain visible in
// the economics tables while the registry coverage check flags them.
export function canonicalProvider(value: string): string {
    const normalized = normalizeProviderName(value);
    return resolveProvider(normalized)?.id ?? normalized;
}

function explanationByKey<T extends { month: string; provider: string }>(
    explanations: readonly T[],
): Map<string, T> {
    return new Map(
        explanations.map((explanation) => [
            `${explanation.month}|${canonicalProvider(explanation.provider)}`,
            explanation,
        ]),
    );
}

export function meterDriftExplanation(
    month: string,
    provider: string,
    privateConfig?: EconomicsPrivateConfig,
): MeterDriftExplanation | undefined {
    return explanationByKey(
        privateConfig?.reconciliation.meterDriftExplanations ?? [],
    ).get(`${month}|${canonicalProvider(provider)}`);
}

export function providerCheckExplanation(
    month: string,
    provider: string,
    privateConfig?: EconomicsPrivateConfig,
): ProviderCheckExplanation | undefined {
    return explanationByKey(
        privateConfig?.reconciliation.providerCheckExplanations ?? [],
    ).get(`${month}|${canonicalProvider(provider)}`);
}

export function pollenWitnessExplanation(
    month: string,
    provider: string,
    privateConfig?: EconomicsPrivateConfig,
): PollenWitnessExplanation | undefined {
    return explanationByKey(
        privateConfig?.reconciliation.pollenWitnessExplanations ?? [],
    ).get(`${month}|${canonicalProvider(provider)}`);
}

type ObservationInput = Pick<Data, "opCloud" | "opPollen" | "opTransactions">;

function nextMonth(month: string): string {
    const [year, number] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, number, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function cloudObservationMonths(row: OpCloudRow): string[] {
    const startMonth = row.start.slice(0, 7);
    const isVerifiedZeroRange =
        row.resource_sku === "verified-zero" &&
        Number(row.resource_count) === 0 &&
        Number(row.credit) === 0 &&
        Number(row.paid) === 0;
    if (!isVerifiedZeroRange) return [startMonth];

    const endMonth = row.end.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(endMonth) || endMonth < startMonth) {
        return [startMonth];
    }
    const endIsMonthBoundary = row.end.startsWith(`${endMonth}-01 00:00:00`);
    const exclusiveEnd = endIsMonthBoundary ? endMonth : nextMonth(endMonth);
    const months: string[] = [];
    for (
        let current = startMonth;
        current < exclusiveEnd && months.length < 120;
        current = nextMonth(current)
    ) {
        months.push(current);
    }
    return months.length ? months : [startMonth];
}

export function collectProviderObservations(
    data: ObservationInput,
): ProviderObservation[] {
    const observations = new Map<string, ProviderObservation>();
    const add = ({
        accountId,
        dashboardChecked,
        month,
        source,
        vendor,
    }: ProviderObservation) => {
        const normalized = normalizeProviderName(vendor);
        const normalizedAccountId = accountId
            ? normalizeProviderName(accountId)
            : undefined;
        if (!normalized || !/^\d{4}-\d{2}$/.test(month)) return;
        const key = `${month}|${normalized}|${source}|${normalizedAccountId ?? ""}`;
        const existing = observations.get(key);
        observations.set(key, {
            month,
            vendor: normalized,
            source,
            dashboardChecked:
                dashboardChecked || existing?.dashboardChecked === true,
            ...(normalizedAccountId == null
                ? {}
                : { accountId: normalizedAccountId }),
        });
    };

    for (const row of (data.opTransactions ?? []).filter(
        (item) => item.kind === "transaction",
    )) {
        if (!isComputeOrInfrastructureCategory(transactionCategory(row))) {
            continue;
        }
        add({
            month: row.date.slice(0, 7),
            vendor: row.vendor,
            source: "transactions",
            // Wise proves payment. It does not prove the provider dashboard or
            // statement was collected.
            dashboardChecked: false,
        });
    }
    for (const row of data.opCloud ?? []) {
        if (row.type.trim().toLowerCase() === "balance") continue;
        for (const month of cloudObservationMonths(row)) {
            add({
                month,
                vendor: row.vendor,
                source: "cloud",
                accountId: row.account_id,
                // A credit award proves a grant, not that the month's provider
                // statement, invoice, or usage dashboard was collected.
                dashboardChecked: !(row.credit > 0 && row.paid === 0),
            });
        }
    }
    for (const row of data.opPollen ?? []) {
        add({
            month: row.month.slice(0, 7),
            vendor: row.vendor,
            source: "pollen",
            dashboardChecked: false,
        });
    }

    return [...observations.values()].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.vendor.localeCompare(b.vendor) ||
            a.source.localeCompare(b.source),
    );
}

export type ProviderReviewRow = {
    month: string;
    provider: string;
    label: string;
    meteringBasis: MeteringBasis | null;
    observedAliases: string[];
    sources: ProviderObservationSource[];
    mapped: boolean;
    monthlyReview: boolean;
    dashboardChecked: boolean;
    dashboardStatus:
        | "recorded"
        | "reviewed gap"
        | "due"
        | "no activity"
        | "not required";
    checkExplanation: ProviderCheckExplanation | null;
    expectedAccounts: ProviderAccountDefinition[];
    observedAccountIds: string[];
    accountStatus:
        | "complete"
        | "partial"
        | "unassigned"
        | "no activity"
        | "not tracked";
    connector: string | null;
};

const SOURCE_ORDER: ProviderObservationSource[] = [
    "transactions",
    "cloud",
    "pollen",
];

function reviewMonths(data: Data, filter: MonthFilterValue): string[] {
    if (typeof filter === "string" && /^\d{4}-\d{2}$/.test(filter)) {
        return [filter];
    }
    const months = collectMonths(data);
    return months.filter((month) => matchesMonth(month, filter));
}

export function providerReviewRows(
    data: Data,
    month: MonthFilterValue = "",
): ProviderReviewRow[] {
    const observations =
        data.providerObservations ?? collectProviderObservations(data);
    const months = reviewMonths(data, month);
    type ReviewAccumulator = ProviderReviewRow & {
        aliasSet: Set<string>;
        accountSet: Set<string>;
        sourceSet: Set<ProviderObservationSource>;
        hasUnassignedAccountEvidence: boolean;
    };
    const rows = new Map<string, ReviewAccumulator>();

    const makeRow = (
        reviewMonth: string,
        provider: string,
        definition?: ProviderDefinition,
    ): ReviewAccumulator => {
        const expectedAccounts = definition
            ? activeProviderAccounts(definition, reviewMonth)
            : [];
        return {
            month: reviewMonth,
            provider,
            label: definition?.label ?? "Not mapped",
            meteringBasis: definition?.meteringBasis ?? null,
            observedAliases: [],
            sources: [],
            mapped: definition != null,
            monthlyReview: definition?.monthlyReview ?? false,
            dashboardChecked: false,
            checkExplanation: null,
            dashboardStatus: definition?.monthlyReview
                ? "no activity"
                : "not required",
            expectedAccounts,
            observedAccountIds: [],
            accountStatus: expectedAccounts.length
                ? "no activity"
                : "not tracked",
            connector: definition?.connector ?? null,
            aliasSet: new Set<string>(),
            accountSet: new Set<string>(),
            sourceSet: new Set<ProviderObservationSource>(),
            hasUnassignedAccountEvidence: false,
        };
    };

    for (const reviewMonth of months) {
        for (const provider of PROVIDER_REGISTRY) {
            if (!provider.monthlyReview) continue;
            const key = `${reviewMonth}|${provider.id}`;
            rows.set(key, makeRow(reviewMonth, provider.id, provider));
        }
    }

    for (const observation of observations) {
        if (!months.includes(observation.month)) continue;
        const definition = resolveProvider(observation.vendor);
        const provider = definition?.id ?? observation.vendor;
        const key = `${observation.month}|${provider}`;
        const row =
            rows.get(key) ?? makeRow(observation.month, provider, definition);
        row.aliasSet.add(observation.vendor);
        row.sourceSet.add(observation.source);
        row.dashboardChecked ||= observation.dashboardChecked;
        if (observation.source === "cloud") {
            if (observation.accountId) {
                row.accountSet.add(observation.accountId);
            } else if (row.expectedAccounts.length > 0) {
                row.hasUnassignedAccountEvidence = true;
            }
        }
        rows.set(key, row);
    }

    return [...rows.values()]
        .map(
            ({
                accountSet,
                aliasSet,
                hasUnassignedAccountEvidence,
                sourceSet,
                ...row
            }) => {
                const observedAccountIds = [...accountSet].sort((a, b) =>
                    a.localeCompare(b),
                );
                const expectedIds = new Set(
                    row.expectedAccounts.map((account) => account.id),
                );
                const hasUnknownAccount = observedAccountIds.some(
                    (accountId) => !expectedIds.has(accountId),
                );
                const allExpectedAccountsObserved = row.expectedAccounts.every(
                    (account) => accountSet.has(account.id),
                );
                const accountStatus =
                    row.expectedAccounts.length === 0
                        ? ("not tracked" as const)
                        : hasUnassignedAccountEvidence || hasUnknownAccount
                          ? ("unassigned" as const)
                          : allExpectedAccountsObserved
                            ? ("complete" as const)
                            : accountSet.size > 0
                              ? ("partial" as const)
                              : sourceSet.size > 0
                                ? ("unassigned" as const)
                                : ("no activity" as const);
                const checkExplanation = providerCheckExplanation(
                    row.month,
                    row.provider,
                    data.privateConfig,
                );
                return {
                    ...row,
                    checkExplanation: checkExplanation ?? null,
                    observedAliases: [...aliasSet].sort((a, b) =>
                        a.localeCompare(b),
                    ),
                    observedAccountIds,
                    sources: SOURCE_ORDER.filter((source) =>
                        sourceSet.has(source),
                    ),
                    accountStatus,
                    dashboardStatus: checkExplanation
                        ? ("reviewed gap" as const)
                        : row.dashboardChecked
                          ? ("recorded" as const)
                          : row.mapped &&
                              resolveProvider(row.provider)?.monthlyReview
                            ? sourceSet.size > 0
                                ? ("due" as const)
                                : ("no activity" as const)
                            : ("not required" as const),
                };
            },
        )
        .sort(
            (a, b) =>
                Number(a.mapped) - Number(b.mapped) ||
                Number(a.dashboardStatus !== "due") -
                    Number(b.dashboardStatus !== "due") ||
                b.month.localeCompare(a.month) ||
                a.provider.localeCompare(b.provider),
        );
}

export function missingProviderMappings(
    data: Data,
    month: MonthFilterValue = "",
): ProviderReviewRow[] {
    return providerReviewRows(data, month).filter((row) => !row.mapped);
}
