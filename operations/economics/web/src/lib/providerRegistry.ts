import { createProviderResolver } from "../../../../../shared/providers";
import registryJson from "../../../provider-registry.json";
import type {
    Data,
    EconomicsPrivateConfig,
    MeterDriftExplanation,
    OpTransactionRow,
    PollenWitnessExplanation,
    ProviderCheckExplanation,
    ProviderObservation,
    ProviderObservationSource,
    VendorLedgerRow,
} from "../types";
import {
    type Category,
    type CategoryValue,
    cloudCategory,
    isCategory,
    isComputeOrInfrastructureCategory,
} from "./categories";
import { collectMonths, type MonthFilterValue, matchesMonth } from "./months";

// Bank movements of one vendor can serve several business purposes. Rules run
// in order on the lowercase description (any `match` substring, any exact
// `equals`) or on inflows; the first hit wins, otherwise `category` applies.
export type CashRule = {
    match?: string[];
    equals?: string[];
    inflow?: boolean;
    category: Category;
    // The matched movement changes cash but never appears as a table line.
    cashOnly?: boolean;
};

export type ProviderDefinition = {
    id: string;
    label: string;
    // Business category of the vendor's cash in the P&L. "uncategorized"
    // marks a vendor seen in the bank ledger that nobody has reviewed yet:
    // a canonical supplied category is trusted until the review lands.
    category: CategoryValue;
    cashRules?: CashRule[];
    // Runway line the vendor is folded into (office merchants, admin purposes).
    runwayLine?: string;
    // Bank movements of this vendor change cash but never appear as a P&L or
    // adjustment line (a reimbursement of pre-window costs, for example).
    cashOnly?: boolean;
    meteringBasis: MeteringBasis;
    // Pollen routing scope for cloud vendors that also sell infrastructure.
    pollenComputeMode?: "managed-inference";
    aliases: string[];
    connector: string | null;
    monthlyReview: boolean;
    activeFrom?: string;
    activeTo?: string | null;
    balanceTracking: boolean;
    collectionMethod: ProviderCollectionMethod | null;
    access?: ProviderAccessTarget[];
    accounts?: ProviderAccountDefinition[];
    // Reviewed provider labels (meter names, invoice slugs, dashboard display
    // names) keyed to Pollen model ids. A string array means one billed line
    // served several ids of the same model at the same provider; null means
    // the label has no Pollen model; an array of dated rules pins the label to
    // the id it meant in each period.
    modelLabels?: Record<
        string,
        | string
        | string[]
        | null
        | { from?: string; until?: string; model: string | string[] | null }[]
    >;
};

export type ProviderCollectionMethod = "api" | "cli" | "dashboard" | "internal";

export type ProviderAccessTarget = {
    workspace: string;
    url: string;
    accountId?: string;
    loginEmail?: string;
    label?: string;
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
    aliases?: string[];
    loginEmail?: string;
    activeFrom: string;
    activeTo: string | null;
};

// A reviewed re-attribution of Pollen rows whose provider tag named a vendor
// that never billed them. Bounded by month; evidence is mandatory.
export type PollenVendorOverride = {
    vendor: string;
    model: string;
    to: string;
    from: string;
    until: string;
    evidence: string;
};

export type PollenComputeModeOverride = {
    vendor: string;
    model: string;
    from: string;
    until: string;
    mode: "managed-inference" | "gpu-capacity";
    evidence: string;
};

export type CanonicalModelRule = {
    provider?: string;
    from: string;
    until?: string;
    model: string;
    evidence: string;
};
export type CanonicalModelTarget = string | CanonicalModelRule[];

type ProviderRegistryFile = {
    version: number;
    canonicalModelRenames: Record<string, CanonicalModelTarget>;
    pollenVendorOverrides: PollenVendorOverride[];
    pollenComputeModeOverrides: PollenComputeModeOverride[];
    // Pollen model ids that no longer exist in the shared registry but still
    // identify historical costs. Removing a model from the product does not
    // invalidate what it cost.
    retiredModels: string[];
    providers: Pick<
        ProviderDefinition,
        "id" | "aliases" | "modelLabels" | "pollenComputeMode"
    >[];
};

export type ProviderReconciliationExplanation =
    | PollenWitnessExplanation
    | MeterDriftExplanation;

export let PROVIDER_REGISTRY: ProviderDefinition[] = [];
let providerResolver:
    | ReturnType<typeof createProviderResolver<ProviderDefinition>>
    | undefined;

// One immutable source snapshot per dashboard load. Never calculate with an
// empty catalog or silently fall back to a second repository copy.
export function initializeProviderRegistry(value: unknown): void {
    const document = value as {
        version?: unknown;
        providers?: ProviderDefinition[];
    } | null;
    if (document?.version !== 1 || !Array.isArray(document.providers))
        throw new Error("Vendor details: invalid document");
    const mappings = new Map(
        (registryJson as ProviderRegistryFile).providers.map((provider) => [
            provider.id,
            provider,
        ]),
    );
    const seen = new Set<string>();
    const text = (value: unknown): value is string =>
        typeof value === "string" && value.trim().length > 0;
    const month = (value: unknown) =>
        value == null ||
        (typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
    const providers = document.providers.map((provider) => {
        if (
            !provider ||
            !text(provider.id) ||
            seen.has(provider.id) ||
            !mappings.has(provider.id) ||
            !text(provider.label) ||
            !(
                provider.category === "uncategorized" ||
                isCategory(provider.category)
            ) ||
            ![
                "direct",
                "capacity",
                "mixed",
                "internal",
                "not_applicable",
            ].includes(provider.meteringBasis) ||
            typeof provider.monthlyReview !== "boolean" ||
            typeof provider.balanceTracking !== "boolean" ||
            !month(provider.activeFrom) ||
            !month(provider.activeTo) ||
            (provider.cashOnly !== undefined &&
                typeof provider.cashOnly !== "boolean") ||
            (provider.runwayLine !== undefined && !text(provider.runwayLine)) ||
            !(provider.connector === null || text(provider.connector)) ||
            !(
                provider.collectionMethod === null ||
                ["api", "cli", "dashboard", "internal"].includes(
                    provider.collectionMethod,
                )
            ) ||
            ["aliases", "modelLabels", "pollenComputeMode"].some((key) =>
                Object.hasOwn(provider, key),
            )
        )
            throw new Error(
                `Vendor details: invalid definition ${provider?.id ?? ""}`,
            );
        for (const key of ["cashRules", "accounts", "access"] as const)
            if (provider[key] !== undefined && !Array.isArray(provider[key]))
                throw new Error(
                    `Vendor details: invalid ${key} for ${provider.id}`,
                );
        for (const rule of provider.cashRules ?? []) {
            if (
                !rule ||
                !isCategory(rule.category) ||
                [rule.match, rule.equals].some(
                    (values) =>
                        values !== undefined &&
                        (!Array.isArray(values) ||
                            values.some(
                                (v) => !text(v) || v !== v.trim().toLowerCase(),
                            )),
                ) ||
                (rule.inflow !== undefined &&
                    typeof rule.inflow !== "boolean") ||
                (rule.cashOnly !== undefined &&
                    typeof rule.cashOnly !== "boolean") ||
                !(rule.match?.length || rule.equals?.length || rule.inflow)
            )
                throw new Error(
                    `Vendor details: invalid cash rule for ${provider.id}`,
                );
        }
        const accounts = new Set<string>();
        for (const account of provider.accounts ?? []) {
            if (
                !account ||
                !text(account.id) ||
                !text(account.label) ||
                !text(account.activeFrom) ||
                !month(account.activeFrom) ||
                !month(account.activeTo) ||
                (account.activeTo != null &&
                    account.activeTo < account.activeFrom) ||
                (account.aliases !== undefined &&
                    (!Array.isArray(account.aliases) ||
                        account.aliases.some((alias) => !text(alias))))
            )
                throw new Error(
                    `Vendor details: invalid account for ${provider.id}`,
                );
            for (const name of new Set(
                [account.id, ...(account.aliases ?? [])].map(
                    normalizeProviderName,
                ),
            )) {
                if (accounts.has(name))
                    throw new Error(
                        `Vendor details: duplicate account for ${provider.id}`,
                    );
                accounts.add(name);
            }
        }
        for (const access of provider.access ?? [])
            if (
                !access ||
                !text(access.workspace) ||
                !text(access.url) ||
                !/^https?:\/\//.test(access.url)
            )
                throw new Error(
                    `Vendor details: invalid access link for ${provider.id}`,
                );
        seen.add(provider.id);
        return { ...provider, ...mappings.get(provider.id) };
    });
    if (seen.size !== mappings.size)
        throw new Error("Vendor details: incomplete vendor catalog");
    if (providerResolver)
        throw new Error(
            "Vendor details already loaded; reload to use a new revision",
        );
    PROVIDER_REGISTRY = providers;
    providerResolver = createProviderResolver(PROVIDER_REGISTRY);
}
// Exact historical identities, with dated rules for aliases that changed model.
export const CANONICAL_MODEL_RENAMES: Readonly<
    Record<string, CanonicalModelTarget>
> = registryJson.canonicalModelRenames;
export const RETIRED_MODELS: readonly string[] = (
    registryJson as ProviderRegistryFile
).retiredModels;
export const POLLEN_VENDOR_OVERRIDES: readonly PollenVendorOverride[] = (
    registryJson as ProviderRegistryFile
).pollenVendorOverrides;

export const POLLEN_COMPUTE_MODE_OVERRIDES: readonly PollenComputeModeOverride[] =
    (registryJson as ProviderRegistryFile).pollenComputeModeOverrides;

export function pollenVendorOverride(
    month: string,
    vendor: string,
    model: string,
): string | undefined {
    return POLLEN_VENDOR_OVERRIDES.find(
        (override) =>
            override.vendor === vendor &&
            override.model === model &&
            override.from <= month &&
            month <= override.until,
    )?.to;
}
export function resolveProvider(value: string): ProviderDefinition | undefined {
    if (!providerResolver) throw new Error("Vendor details have not loaded");
    return providerResolver(value);
}

export function normalizeProviderName(value: string): string {
    return value.trim().toLowerCase();
}

function cashRuleMatches(
    rule: CashRule,
    description: string,
    amount: number,
): boolean {
    return (
        (rule.match ?? []).some((needle) => description.includes(needle)) ||
        (rule.equals ?? []).includes(description) ||
        (rule.inflow === true && amount > 0)
    );
}

// The P&L category of a bank movement, decided by the vendor registry.
export function transactionCategory(
    row: Pick<
        OpTransactionRow,
        "amount" | "category" | "description" | "kind" | "vendor"
    >,
): CategoryValue {
    if (row.kind === "opening_balance") return "balance_sheet";

    const supplied = normalizeProviderName(row.category);
    if (supplied === "creator_payout") return "revenue_share";
    // A reviewed deposit/refund or other balance-sheet movement is not a
    // recurring vendor expense (for example a Deel deposit is not payroll).
    if (supplied === "balance_sheet") return "balance_sheet";

    const provider = resolveProvider(row.vendor);
    if (provider) {
        const description = normalizeProviderName(row.description);
        const rule = (provider.cashRules ?? []).find((candidate) =>
            cashRuleMatches(candidate, description, Number(row.amount)),
        );
        if (rule) return rule.category;
        if (provider.category !== "uncategorized") return provider.category;
    }
    return isCategory(supplied) ? supplied : "uncategorized";
}

// A bank movement that changes cash without a P&L or adjustment line: the
// vendor is cash-only, or the cash rule that classifies the movement is.
export function cashOnlyTransaction(
    row: Pick<OpTransactionRow, "amount" | "description" | "vendor">,
): boolean {
    const provider = resolveProvider(row.vendor);
    if (!provider) return false;
    if (provider.cashOnly) return true;
    const description = normalizeProviderName(row.description);
    const rule = (provider.cashRules ?? []).find((candidate) =>
        cashRuleMatches(candidate, description, Number(row.amount)),
    );
    return rule?.cashOnly === true;
}

// Explicit service types decide the category. Invoice subscriptions and
// adjustments use the reviewed vendor category; unknown types stay invalid.
export function ledgerCategory(
    row: Pick<VendorLedgerRow, "type" | "vendor">,
): CategoryValue {
    const type = normalizeProviderName(row.type);
    const categoryFromType = cloudCategory(row);
    if (categoryFromType !== "uncategorized") return categoryFromType;
    if (type !== "subscription" && type !== "adjustment")
        return "uncategorized";
    const category = resolveProvider(row.vendor)?.category;
    return category && category !== "uncategorized"
        ? category
        : "uncategorized";
}

// The Runway line a vendor's cash is shown under.
export function runwayLineItem(category: string, vendor: string): string {
    const provider = resolveProvider(vendor);
    return provider?.runwayLine != null && provider.category === category
        ? provider.runwayLine
        : vendor;
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

export function normalizeProviderAccountId(value?: string): string {
    return normalizeProviderName(value?.trim() || "default");
}

export function resolveProviderAccount(
    provider: ProviderDefinition,
    value?: string,
): ProviderAccountDefinition | undefined {
    const normalized = normalizeProviderAccountId(value);
    return provider.accounts?.find(
        (account) =>
            normalizeProviderAccountId(account.id) === normalized ||
            (account.aliases ?? []).some(
                (alias) => normalizeProviderAccountId(alias) === normalized,
            ),
    );
}

export function canonicalProviderAccountId(
    provider: ProviderDefinition | undefined,
    value?: string,
): string {
    const normalized = normalizeProviderAccountId(value);
    return provider == null
        ? normalized
        : (resolveProviderAccount(provider, normalized)?.id ?? normalized);
}

function providerRequiresReview(
    provider: ProviderDefinition,
    month: string,
): boolean {
    return (
        provider.monthlyReview &&
        (provider.activeFrom == null || provider.activeFrom <= month) &&
        (provider.activeTo == null || provider.activeTo >= month) &&
        (!provider.accounts?.length ||
            activeProviderAccounts(provider, month).length > 0)
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
        privateConfig?.reviewNotes.meterDriftExplanations ?? [],
    ).get(`${month}|${canonicalProvider(provider)}`);
}

export function providerCheckExplanation(
    month: string,
    provider: string,
    privateConfig?: EconomicsPrivateConfig,
): ProviderCheckExplanation | undefined {
    return explanationByKey(
        privateConfig?.reviewNotes.providerCheckExplanations ?? [],
    ).get(`${month}|${canonicalProvider(provider)}`);
}

export function pollenWitnessExplanation(
    month: string,
    provider: string,
    privateConfig?: EconomicsPrivateConfig,
): PollenWitnessExplanation | undefined {
    return explanationByKey(
        privateConfig?.reviewNotes.pollenWitnessExplanations ?? [],
    ).get(`${month}|${canonicalProvider(provider)}`);
}

type ObservationInput = Pick<
    Data,
    "vendorLedger" | "opPollen" | "opTransactions"
>;

function nextMonth(month: string): string {
    const [year, number] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, number, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function cloudObservationMonths(row: VendorLedgerRow): string[] {
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
    const endIsMonthBoundary =
        /^\d{4}-\d{2}-01[ T]00:00:00(?:\.0+)?(?:Z|\+00:00)?$/.test(row.end);
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
        const definition = resolveProvider(normalized);
        const resolvedAccount = definition
            ? resolveProviderAccount(definition, accountId)
            : undefined;
        const normalizedAccountId =
            resolvedAccount?.id ??
            (accountId?.trim()
                ? normalizeProviderAccountId(accountId)
                : undefined);
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
    for (const row of data.vendorLedger ?? []) {
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
            monthlyReview: definition
                ? providerRequiresReview(definition, reviewMonth)
                : false,
            dashboardChecked: false,
            checkExplanation: null,
            dashboardStatus:
                definition && providerRequiresReview(definition, reviewMonth)
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
            if (!providerRequiresReview(provider, reviewMonth)) continue;
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
        if (definition?.monthlyReview) row.monthlyReview = true;
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
                          : row.mapped && row.monthlyReview
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
