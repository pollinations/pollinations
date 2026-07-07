import type {
    Data,
    PollenMonthlyRow,
    RevenueMonthlyRow,
    TransactionRow,
} from "../types";
import { toUsd } from "./fx";
import { matchesMonth, monthLabel, WINDOW_START } from "./months";

// ---------------------------------------------------------------- revenue

export type MonthlyRevenue = {
    month: string;
    grossUsd: number;
    netUsd: number;
    netRatio: number | null;
};

export function monthlyRevenue(rows: RevenueMonthlyRow[]): MonthlyRevenue[] {
    const byMonth = new Map<string, { gross: number; net: number }>();
    for (const row of rows) {
        const entry = byMonth.get(row.month) ?? { gross: 0, net: 0 };
        entry.gross += toUsd(row.gross_amount, row.currency, row.month);
        entry.net += toUsd(
            row.gross_amount - row.fees_amount - row.refunds_amount,
            row.currency,
            row.month,
        );
        byMonth.set(row.month, entry);
    }
    return [...byMonth.entries()]
        .map(([month, { gross, net }]) => ({
            month,
            grossUsd: gross,
            netUsd: net,
            netRatio: gross > 0 ? net / gross : null,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
}

export function globalNetRatio(rows: RevenueMonthlyRow[]): number | null {
    let gross = 0;
    let net = 0;
    for (const entry of monthlyRevenue(rows)) {
        gross += entry.grossUsd;
        net += entry.netUsd;
    }
    return gross > 0 ? net / gross : null;
}

export function breakEvenMultiplier(netRatio: number | null): number | null {
    return netRatio && netRatio > 0 ? 1 / netRatio : null;
}

// ---------------------------------------------------------- transactions

export const CATEGORY_ORDER = [
    "compute",
    "saas",
    "infra",
    "office",
    "admin",
    "payroll",
    "other",
] as const;

// Cash that left the bank for this row: the settled Wise leg.
export function transactionCashUsd(row: TransactionRow): number {
    return toUsd(row.charged_amount, row.charged_currency, row.date);
}

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export type PnlMonth = {
    month: string;
    revenueNetUsd: number | null;
    categories: Record<string, number>;
    spendUsd: number | null;
    cashPnlUsd: number | null;
    creditBurnUsd: number;
    monthInProgress: boolean;
};

export function pnlByMonth(data: Data, now: Date): PnlMonth[] {
    const revenueByMonth = new Map(
        monthlyRevenue(data.revenueMonthly).map((entry) => [
            entry.month,
            entry,
        ]),
    );
    // Wise cash lands near real time, so only the current calendar month is
    // still filling — everything before it is complete.
    const currentMonth = now.toISOString().slice(0, 7);

    const months = new Set<string>();
    for (const row of data.transactions) months.add(row.date.slice(0, 7));
    for (const row of data.providerMonthly) months.add(row.month);
    for (const row of data.revenueMonthly) months.add(row.month);

    return [...months]
        .filter((month) => MONTH_KEY_RE.test(month) && month >= WINDOW_START)
        .sort()
        .map((month) => {
            const categories: Record<string, number> = {};
            for (const row of data.transactions) {
                if (row.date.slice(0, 7) !== month) continue;
                const key = row.category || "other";
                categories[key] =
                    (categories[key] ?? 0) + transactionCashUsd(row);
            }
            const hasTransactions = Object.keys(categories).length > 0;
            const spendUsd = hasTransactions
                ? Object.values(categories).reduce((a, b) => a + b, 0)
                : null;

            let creditBurnUsd = 0;
            for (const row of data.providerMonthly) {
                if (row.month === month) {
                    creditBurnUsd += toUsd(row.credit, row.currency, month);
                }
            }

            const revenueNetUsd = revenueByMonth.get(month)?.netUsd ?? null;
            return {
                month,
                revenueNetUsd,
                categories,
                spendUsd,
                cashPnlUsd:
                    revenueNetUsd != null && spendUsd != null
                        ? revenueNetUsd - spendUsd
                        : null,
                creditBurnUsd,
                monthInProgress: month >= currentMonth,
            };
        });
}

export function categoryColumns(rows: PnlMonth[]): string[] {
    const known = new Set<string>(CATEGORY_ORDER);
    const extra = new Set<string>();
    for (const row of rows) {
        for (const category of Object.keys(row.categories)) {
            if (!known.has(category)) extra.add(category);
        }
    }
    return [...CATEGORY_ORDER, ...[...extra].sort()];
}

export type MonthSpendRow = {
    category: string;
    vendor: string;
    cashUsd: number;
    pctOfSpend: number | null;
};

export type MonthDetail = {
    summary: PnlMonth | null;
    spend: MonthSpendRow[];
    creditBurn: { vendor: string; creditUsd: number }[];
};

// Single-month drill-down: where the month's cash actually went, at the
// grain the monthly matrix cannot show (category × vendor), plus the
// credit-burn shadow per vendor.
export function monthSpendDetail(
    data: Data,
    month: string,
    now: Date,
): MonthDetail {
    const summary =
        pnlByMonth(data, now).find((row) => row.month === month) ?? null;

    const byKey = new Map<string, MonthSpendRow>();
    for (const row of data.transactions) {
        if (row.date.slice(0, 7) !== month) continue;
        const category = row.category || "other";
        const key = `${category}|${row.vendor}`;
        const entry = byKey.get(key) ?? {
            category,
            vendor: row.vendor,
            cashUsd: 0,
            pctOfSpend: null,
        };
        entry.cashUsd += transactionCashUsd(row);
        byKey.set(key, entry);
    }
    const total = [...byKey.values()].reduce((a, row) => a + row.cashUsd, 0);
    const spend = [...byKey.values()]
        .map((row) => ({
            ...row,
            pctOfSpend: total > 0 ? (row.cashUsd / total) * 100 : null,
        }))
        .sort(
            (a, b) =>
                b.cashUsd - a.cashUsd ||
                a.category.localeCompare(b.category) ||
                a.vendor.localeCompare(b.vendor),
        );

    const creditByVendor = new Map<string, number>();
    for (const row of data.providerMonthly) {
        if (row.month !== month) continue;
        const credit = toUsd(row.credit, row.currency, month);
        if (credit <= 0) continue;
        creditByVendor.set(
            row.vendor,
            (creditByVendor.get(row.vendor) ?? 0) + credit,
        );
    }
    const creditBurn = [...creditByVendor.entries()]
        .map(([vendor, creditUsd]) => ({ vendor, creditUsd }))
        .sort((a, b) => b.creditUsd - a.creditUsd);

    return { summary, spend, creditBurn };
}

// ------------------------------------------------------ vendor three-way

// Vendors that never invoice us — community models. (self-hosted was a
// mis-tagged lambda row, remapped at ingest 2026-07-07; airforce/pointsflyer/
// seraphyn/inferenceport are real vendors with pollen-basis provider rows.)
export const INTERNAL_VENDORS = new Set(["community"]);

// Vendors funded by prepaid balance top-ups: cash precedes usage by more
// than a month, so monthly cash matching is meaningless — coverage holds as
// long as cumulative cash keeps up with cumulative paid burn.
export const PREPAID_VENDORS = new Set([
    "vast.ai",
    "deepinfra",
    "pruna",
    "fal",
]);

// Pollen activity below this is noise, not a funding question.
const POLLEN_ACTIVE_USD = 1;

// Provider paid amounts at or below this never raise funding warnings.
const PROVIDER_PAID_FLOOR_USD = 1;

// Slack for prepaid cumulative matching (FX drift, fees, cents).
const PREPAID_EPS_USD = 50;

// Infra rows (Cloudflare, the EC2/CloudFront share of AWS) fund pools and
// cash flow, but they have no pollen plane — they stay out of the compute
// lenses (reconciliation, calibration).
export function isInfraRow(row: { category?: string }): boolean {
    return row.category === "infra";
}

export type Coverage =
    | "ok cash"
    | "ok credit"
    | "cash ±1mo"
    | "prepaid"
    | "internal"
    | "uncovered"
    | "paid unverified"
    | null;

export type VendorPlanes = {
    month: string;
    vendor: string;
    transactionsUsd: number | null;
    providerUsd: number | null;
    creditUsd: number | null;
    pollenUsd: number | null;
    calibX: number | null;
    coverage: Coverage;
};

export function monthShift(month: string, delta: number): string {
    const total =
        Number(month.slice(0, 4)) * 12 +
        (Number(month.slice(5, 7)) - 1) +
        delta;
    const year = Math.floor(total / 12);
    const mon = (total % 12) + 1;
    return `${String(year).padStart(4, "0")}-${String(mon).padStart(2, "0")}`;
}

// Every pollen-active vendor-month must be funded somewhere: cash from the
// bank, provider credit burn, cash in an adjacent month (arrears invoices
// land off by one), or a prepaid balance whose cumulative top-ups keep up
// with cumulative burn. The inverse also warns: provider says we paid cash,
// but the bank never saw it.
function coverageFor({
    cash,
    creditUsd,
    cumulative,
    month,
    pollenUsd,
    providerUsd,
    transactionsUsd,
    vendor,
}: {
    cash: Map<string, number>;
    creditUsd: number | null;
    cumulative: Map<string, { cashUsd: number; paidUsd: number }>;
    month: string;
    pollenUsd: number | null;
    providerUsd: number | null;
    transactionsUsd: number | null;
    vendor: string;
}): Coverage {
    if (INTERNAL_VENDORS.has(vendor)) return "internal";

    const pollenActive = pollenUsd != null && pollenUsd > POLLEN_ACTIVE_USD;
    const hasCash = transactionsUsd != null;
    const hasCredit = creditUsd != null && creditUsd > 0;
    const cashNear =
        cash.has(`${monthShift(month, -1)}|${vendor}`) ||
        cash.has(`${monthShift(month, 1)}|${vendor}`);
    const providerPaid =
        (providerUsd ?? 0) - (creditUsd ?? 0) > PROVIDER_PAID_FLOOR_USD;

    if (PREPAID_VENDORS.has(vendor)) {
        const run = cumulative.get(`${month}|${vendor}`);
        const funded =
            run != null && run.cashUsd + PREPAID_EPS_USD >= run.paidUsd;
        if (funded) {
            if (pollenActive || providerPaid || hasCash) return "prepaid";
            return null;
        }
        // balance overdrawn — fall through to the funding warnings
    }

    if (pollenActive && !hasCash && !hasCredit && !cashNear) return "uncovered";
    if (providerPaid && !hasCash && !cashNear) return "paid unverified";
    if (pollenActive && hasCash) return "ok cash";
    if (pollenActive && hasCredit) return "ok credit";
    if (pollenActive && cashNear) return "cash ±1mo";
    return null;
}

// Raw month ratio: what $1 of our metering cost at the provider that month.
function monthCalib(
    providerUsd: number | null,
    pollenUsd: number | null,
): number | null {
    if (providerUsd == null || pollenUsd == null || pollenUsd === 0)
        return null;
    return providerUsd / pollenUsd;
}

// One spend, three witnesses: transactions (bank cash), provider (their
// meter), pollen (our metering). A missing witness stays null, never zero.
export function vendorPlanes(data: Data): VendorPlanes[] {
    const transactions = new Map<string, number>();
    for (const row of data.transactions) {
        if (row.category !== "compute") continue;
        const month = row.date.slice(0, 7);
        if (!MONTH_KEY_RE.test(month)) continue;
        const key = `${month}|${row.vendor}`;
        transactions.set(
            key,
            (transactions.get(key) ?? 0) + transactionCashUsd(row),
        );
    }

    const provider = new Map<string, { total: number; credit: number }>();
    for (const row of data.providerMonthly) {
        if (row.month < WINDOW_START) continue; // pre-window grant-burn rows
        if (isInfraRow(row)) continue; // infra has no pollen plane to reconcile
        const key = `${row.month}|${row.vendor}`;
        const entry = provider.get(key) ?? { total: 0, credit: 0 };
        entry.total += toUsd(row.credit + row.paid, row.currency, row.month);
        entry.credit += toUsd(row.credit, row.currency, row.month);
        provider.set(key, entry);
    }

    const pollen = new Map<string, number>();
    for (const row of data.pollenMonthly) {
        const key = `${row.month}|${row.vendor}`;
        pollen.set(
            key,
            (pollen.get(key) ?? 0) +
                toUsd(row.cost_paid + row.cost_quests, row.currency, row.month),
        );
    }

    const keys = new Set([
        ...transactions.keys(),
        ...provider.keys(),
        ...pollen.keys(),
    ]);

    // Running cash vs paid burn per vendor, for prepaid-balance coverage.
    const cumulative = new Map<string, { cashUsd: number; paidUsd: number }>();
    const monthsByVendor = new Map<string, string[]>();
    for (const key of keys) {
        const [month, vendor] = key.split("|");
        const months = monthsByVendor.get(vendor) ?? [];
        months.push(month);
        monthsByVendor.set(vendor, months);
    }
    for (const [vendor, months] of monthsByVendor) {
        let cashUsd = 0;
        let paidUsd = 0;
        for (const month of months.sort()) {
            const key = `${month}|${vendor}`;
            cashUsd += transactions.get(key) ?? 0;
            const entry = provider.get(key);
            if (entry) paidUsd += entry.total - entry.credit;
            cumulative.set(key, { cashUsd, paidUsd });
        }
    }

    return [...keys].sort().map((key) => {
        const [month, vendor] = key.split("|");
        const providerEntry = provider.get(key);
        const providerUsd = providerEntry ? providerEntry.total : null;
        const creditUsd = providerEntry ? providerEntry.credit : null;
        const pollenUsd = pollen.get(key) ?? null;
        const transactionsUsd = transactions.get(key) ?? null;
        return {
            month,
            vendor,
            transactionsUsd,
            providerUsd,
            creditUsd,
            pollenUsd,
            calibX: monthCalib(providerUsd, pollenUsd),
            coverage: coverageFor({
                cash: transactions,
                creditUsd,
                cumulative,
                month,
                pollenUsd,
                providerUsd,
                transactionsUsd,
                vendor,
            }),
        };
    });
}

export function insightVendorOptions(data: Data): string[] {
    const vendors = new Set<string>();
    for (const row of data.transactions) {
        if (row.category === "compute" && row.vendor.trim()) {
            vendors.add(row.vendor.trim());
        }
    }
    for (const row of data.providerMonthly) {
        if (row.vendor.trim()) vendors.add(row.vendor.trim());
    }
    for (const row of data.pollenMonthly) {
        if (row.vendor.trim()) vendors.add(row.vendor.trim());
    }
    return ["all", ...[...vendors].sort((a, b) => a.localeCompare(b))];
}

// ------------------------------------------------------------- economics

// Vendors whose provider_monthly rows are our own pollen numbers booked back
// (community mirror + meter-less free partners) — their calib is 1.00 by
// construction, a definition rather than a measurement.
export const POLLEN_PRICED_VENDORS = new Set([
    "airforce",
    "community",
    "inferenceport",
    "pointsflyer",
    "seraphyn",
]);

// |calib − 1| beyond this marks a registry mispricing worth fixing.
export const CALIB_DRIFT_ALARM = 0.25;

export type EconGrain = "vendor" | "model";

export type EconRow = {
    vendor: string;
    model: string | null;
    soldPaidUsd: number;
    ecoPaidUsd: number;
    retainedPaidUsd: number;
    soldQuestsUsd: number;
    trueCostPaidUsd: number;
    questBurnUsd: number;
    calib: number | null;
    pollenPriced: boolean;
    creditSharePct: number | null;
    trueMultiplier: number | null;
    marginUsd: number;
    flags: string[];
};

// One table, two grains: the Vendors summary is exactly the Models table
// rolled up (calib is per-vendor, so every dollar column is additive and
// true × is Σ/Σ). The math treats the raw data as perfect — calib is a plain
// Σ provider actual / Σ our metering over the scope, no pairing or smoothing —
// and every condition that could bend that number becomes a flag instead:
// "unwitnessed" months (pollen active, no provider row yet — calib reads low),
// "unmetered" months (provider billed, no pollen — calib reads high),
// "no meter" (no provider rows at all — true cost falls back to our metering).
export function economics(
    data: Data,
    monthFilter: string,
    grain: EconGrain,
): EconRow[] {
    type VendorFacts = {
        meteredByMonth: Map<string, number>;
        actualUsd: number;
        creditUsd: number;
        providerMonths: Set<string>;
        hasProvider: boolean;
    };
    const vendors = new Map<string, VendorFacts>();
    const factsFor = (vendor: string): VendorFacts => {
        let facts = vendors.get(vendor);
        if (!facts) {
            facts = {
                meteredByMonth: new Map(),
                actualUsd: 0,
                creditUsd: 0,
                providerMonths: new Set(),
                hasProvider: false,
            };
            vendors.set(vendor, facts);
        }
        return facts;
    };

    for (const row of data.providerMonthly) {
        if (row.month < WINDOW_START) continue; // pre-window grant-burn rows
        if (isInfraRow(row)) continue; // calib compares compute against pollen
        if (!matchesMonth(row.month, monthFilter)) continue;
        const facts = factsFor(row.vendor);
        facts.hasProvider = true;
        facts.providerMonths.add(row.month);
        facts.actualUsd += toUsd(
            row.credit + row.paid,
            row.currency,
            row.month,
        );
        facts.creditUsd += toUsd(row.credit, row.currency, row.month);
    }

    type Accumulator = {
        vendor: string;
        model: string | null;
        soldPaid: number;
        eco: number;
        soldQuests: number;
        meteredPaid: number;
        meteredQuests: number;
    };
    const byKey = new Map<string, Accumulator>();
    for (const row of data.pollenMonthly) {
        if (!matchesMonth(row.month, monthFilter)) continue;
        const facts = factsFor(row.vendor);
        facts.meteredByMonth.set(
            row.month,
            (facts.meteredByMonth.get(row.month) ?? 0) +
                toUsd(row.cost_paid + row.cost_quests, row.currency, row.month),
        );
        const key =
            grain === "model" ? `${row.vendor}|${row.model}` : row.vendor;
        const entry = byKey.get(key) ?? {
            vendor: row.vendor,
            model: grain === "model" ? row.model : null,
            soldPaid: 0,
            eco: 0,
            soldQuests: 0,
            meteredPaid: 0,
            meteredQuests: 0,
        };
        entry.soldPaid += toUsd(row.price_paid, row.currency, row.month);
        entry.eco += toUsd(
            row.byop_paid + row.model_paid,
            row.currency,
            row.month,
        );
        entry.soldQuests += toUsd(row.price_quests, row.currency, row.month);
        entry.meteredPaid += toUsd(row.cost_paid, row.currency, row.month);
        entry.meteredQuests += toUsd(row.cost_quests, row.currency, row.month);
        byKey.set(key, entry);
    }

    type VendorCalib = {
        calib: number | null;
        pollenPriced: boolean;
        creditSharePct: number | null;
        flags: string[];
    };
    const calibs = new Map<string, VendorCalib>();
    for (const [vendor, facts] of vendors) {
        if (facts.meteredByMonth.size === 0) continue; // not pollen-routed
        const metered = [...facts.meteredByMonth.values()].reduce(
            (a, b) => a + b,
            0,
        );
        const pollenPriced = POLLEN_PRICED_VENDORS.has(vendor);
        const flags: string[] = [];
        let calib: number | null = null;
        if (pollenPriced) {
            calib = 1;
        } else if (!facts.hasProvider) {
            flags.push("no meter");
        } else if (metered > 0) {
            calib = facts.actualUsd / metered;
            const unwitnessed = [...facts.meteredByMonth.entries()]
                .filter(
                    ([month, usd]) =>
                        usd > POLLEN_ACTIVE_USD &&
                        !facts.providerMonths.has(month),
                )
                .map(([month]) => month)
                .sort();
            if (unwitnessed.length) {
                flags.push(
                    `unwitnessed ${unwitnessed.map(monthLabel).join(", ")}`,
                );
            }
            const unmetered = [...facts.providerMonths]
                .filter((month) => !facts.meteredByMonth.has(month))
                .sort();
            if (unmetered.length) {
                flags.push(`unmetered ${unmetered.map(monthLabel).join(", ")}`);
            }
        }
        calibs.set(vendor, {
            calib,
            pollenPriced,
            creditSharePct:
                facts.hasProvider && facts.actualUsd > 0
                    ? (facts.creditUsd / facts.actualUsd) * 100
                    : null,
            flags,
        });
    }

    return [...byKey.values()]
        .map((entry) => {
            const vendorCalib = calibs.get(entry.vendor);
            const applied = vendorCalib?.calib ?? 1;
            const trueCostPaidUsd = entry.meteredPaid * applied;
            const retainedPaidUsd = entry.soldPaid - entry.eco;
            return {
                vendor: entry.vendor,
                model: entry.model,
                soldPaidUsd: entry.soldPaid,
                ecoPaidUsd: entry.eco,
                retainedPaidUsd,
                soldQuestsUsd: entry.soldQuests,
                trueCostPaidUsd,
                questBurnUsd: entry.meteredQuests * applied,
                calib: vendorCalib?.calib ?? null,
                pollenPriced: vendorCalib?.pollenPriced ?? false,
                creditSharePct: vendorCalib?.creditSharePct ?? null,
                trueMultiplier:
                    trueCostPaidUsd > 0
                        ? retainedPaidUsd / trueCostPaidUsd
                        : null,
                marginUsd: retainedPaidUsd - trueCostPaidUsd,
                flags: vendorCalib?.flags ?? [],
            };
        })
        .sort((a, b) => {
            // Most underpriced first; ratio-less rows (quest-only) last,
            // ordered by what they burn.
            if (a.trueMultiplier == null && b.trueMultiplier == null) {
                return b.questBurnUsd - a.questBurnUsd;
            }
            if (a.trueMultiplier == null) return 1;
            if (b.trueMultiplier == null) return -1;
            return a.trueMultiplier - b.trueMultiplier;
        });
}

// --------------------------------------------------------- credit runway

export type GrantStatus = {
    vendor: string;
    label: string;
    grantedUsd: number;
    startDate: string;
    expires: string | null; // null = no expiry
    allocatedUsd: number;
    lapsedUsd: number; // unused capacity of an expired grant
    active: boolean; // not expired, capacity remains
    finishedDate: string | null; // fill month ("YYYY-MM") or expiry date
};

export type RunwayRow = {
    vendor: string;
    grantedUsd: number;
    burnedUsd: number;
    remainingUsd: number;
    lapsedUsd: number;
    unallocatedUsd: number; // burn no grant could absorb
    lastMonthBurnUsd: number;
    currentMonthBurnUsd: number;
    cashLastMonthUsd: number;
    cashCurrentMonthUsd: number;
    monthlyRateUsd: number | null;
    rateBasis: "current" | "last" | "stale" | null;
    depletionDate: string | null; // ISO day
    depletionReason: "burn" | "expiry" | null;
    finished: boolean;
    finishedDate: string | null;
    flags: string[];
    grants: GrantStatus[];
};

const NO_EXPIRY = "1970-01-01";
const AVG_DAYS_PER_MONTH = 30.44;
const POOL_EPS_USD = 0.5;

// Allocate each vendor's monthly credit burn to its grants. Pass 1 respects
// each grant's active window (start month ≤ burn month ≤ expiry month),
// oldest grant first — so an expired grant only absorbs burn from its own
// lifetime and its unused remainder LAPSES. Pass 2 re-allocates any leftover
// to non-expired grants regardless of window (vendor-pooled burn can't be
// attributed per-grant more precisely than that); what still doesn't fit is
// real unallocated burn. Exhaustion (allocated ≈ granted) marks a grant
// inactive and records the month it filled.
export function allocateGrants(
    data: Data,
    now: Date,
): { grants: GrantStatus[]; unallocated: Map<string, number> } {
    const today = now.toISOString().slice(0, 10);

    // Pollen-priced vendors' grants participate too (pointsflyer's gift):
    // the pool is valued at our registry prices rather than a vendor-stated
    // balance, but a finished gift belongs in the credits history.
    const byVendor = new Map<string, GrantStatus[]>();
    for (const grant of data.grants) {
        const list = byVendor.get(grant.vendor) ?? [];
        list.push({
            vendor: grant.vendor,
            label: grant.label,
            grantedUsd: toUsd(grant.granted, grant.currency, grant.start_date),
            startDate: grant.start_date,
            expires: grant.expires === NO_EXPIRY ? null : grant.expires,
            allocatedUsd: 0,
            lapsedUsd: 0,
            active: true,
            finishedDate: null,
        });
        byVendor.set(grant.vendor, list);
    }
    for (const list of byVendor.values()) {
        list.sort(
            (a, b) =>
                a.startDate.localeCompare(b.startDate) ||
                a.label.localeCompare(b.label),
        );
    }

    const burnByMonth = new Map<string, Map<string, number>>();
    for (const row of data.providerMonthly) {
        if (!byVendor.has(row.vendor)) continue;
        const credit = toUsd(row.credit, row.currency, row.month);
        if (credit <= 0) continue;
        const months = burnByMonth.get(row.vendor) ?? new Map();
        months.set(row.month, (months.get(row.month) ?? 0) + credit);
        burnByMonth.set(row.vendor, months);
    }

    const fillMonth = new Map<GrantStatus, string>();
    const unallocated = new Map<string, number>();
    for (const [vendor, grants] of byVendor) {
        const months = [
            ...(burnByMonth.get(vendor) ?? new Map()).entries(),
        ].sort((a, b) => a[0].localeCompare(b[0]));
        let overflow = 0;
        for (const [month, burn] of months) {
            let left = burn;
            for (const grant of grants) {
                if (left <= 0) break;
                if (grant.startDate.slice(0, 7) > month) continue;
                if (grant.expires && grant.expires.slice(0, 7) < month) {
                    continue;
                }
                const capacity = grant.grantedUsd - grant.allocatedUsd;
                if (capacity <= 0) continue;
                const take = Math.min(capacity, left);
                grant.allocatedUsd += take;
                left -= take;
                if (grant.grantedUsd - grant.allocatedUsd <= POOL_EPS_USD) {
                    fillMonth.set(grant, month);
                }
            }
            overflow += left;
        }
        // Pass 2: leftover into any non-expired grant with capacity.
        if (overflow > 0) {
            for (const grant of grants) {
                if (overflow <= 0) break;
                if (grant.expires && grant.expires < today) continue;
                const capacity = grant.grantedUsd - grant.allocatedUsd;
                if (capacity <= 0) continue;
                const take = Math.min(capacity, overflow);
                grant.allocatedUsd += take;
                overflow -= take;
                if (grant.grantedUsd - grant.allocatedUsd <= POOL_EPS_USD) {
                    const latest = months[months.length - 1];
                    if (latest && !fillMonth.has(grant)) {
                        fillMonth.set(grant, latest[0]);
                    }
                }
            }
        }
        if (overflow > POOL_EPS_USD) unallocated.set(vendor, overflow);

        for (const grant of grants) {
            const expired = grant.expires != null && grant.expires < today;
            const exhausted =
                grant.grantedUsd - grant.allocatedUsd <= POOL_EPS_USD;
            grant.lapsedUsd = expired
                ? Math.max(grant.grantedUsd - grant.allocatedUsd, 0)
                : 0;
            grant.active = !expired && !exhausted;
            grant.finishedDate = expired
                ? grant.expires
                : exhausted
                  ? (fillMonth.get(grant) ?? null)
                  : null;
        }
    }

    return { grants: [...byVendor.values()].flat(), unallocated };
}

// Where do credits stand NOW — the lens ignores the global period filter and
// reads pre-window burn rows every other lens excludes. Remaining counts only
// non-expired grant capacity (expired remainders lapse). Burn depletion starts
// from the last full-month close, deducts the running month's witnessed burn,
// then divides the live remainder by this month's daily burn intensity. When
// the running month is silent, the last complete month is the fallback signal.
// Vendors whose pools are done (remaining ≈ 0) carry finished=true and their
// finish date.
export function creditRunway(data: Data, now: Date): RunwayRow[] {
    const today = now.toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);
    const lastMonth = monthShift(currentMonth, -1);
    const { grants, unallocated } = allocateGrants(data, now);

    const byVendor = new Map<string, RunwayRow>();
    for (const grant of grants) {
        const row = byVendor.get(grant.vendor) ?? {
            vendor: grant.vendor,
            grantedUsd: 0,
            burnedUsd: 0,
            remainingUsd: 0,
            lapsedUsd: 0,
            unallocatedUsd: unallocated.get(grant.vendor) ?? 0,
            lastMonthBurnUsd: 0,
            currentMonthBurnUsd: 0,
            cashLastMonthUsd: 0,
            cashCurrentMonthUsd: 0,
            monthlyRateUsd: null,
            rateBasis: null,
            depletionDate: null,
            depletionReason: null,
            finished: false,
            finishedDate: null,
            flags: [],
            grants: [],
        };
        row.grantedUsd += grant.grantedUsd;
        row.lapsedUsd += grant.lapsedUsd;
        if (!(grant.expires != null && grant.expires < today)) {
            row.remainingUsd += Math.max(
                grant.grantedUsd - grant.allocatedUsd,
                0,
            );
        }
        row.grants.push(grant);
        byVendor.set(grant.vendor, row);
    }

    const burnMonths = new Map<string, Map<string, number>>();
    for (const row of data.providerMonthly) {
        const entry = byVendor.get(row.vendor);
        if (!entry) continue;
        const credit = toUsd(row.credit, row.currency, row.month);
        const paid = toUsd(row.paid, row.currency, row.month);
        if (credit > 0) {
            entry.burnedUsd += credit;
            if (row.month === lastMonth) entry.lastMonthBurnUsd += credit;
            if (row.month === currentMonth) {
                entry.currentMonthBurnUsd += credit;
            }
            const months = burnMonths.get(row.vendor) ?? new Map();
            months.set(row.month, (months.get(row.month) ?? 0) + credit);
            burnMonths.set(row.vendor, months);
        }
        if (paid > 0) {
            if (row.month === lastMonth) entry.cashLastMonthUsd += paid;
            if (row.month === currentMonth) entry.cashCurrentMonthUsd += paid;
        }
    }

    for (const row of byVendor.values()) {
        row.finished = row.remainingUsd <= POOL_EPS_USD;
        if (row.finished) {
            row.finishedDate =
                row.grants
                    .map((grant) => grant.finishedDate)
                    .filter((date): date is string => date != null)
                    .sort()
                    .pop() ?? null;
        }

        // Some vendors' burn is witnessed in monthly steps well after the
        // usage (aws: Automat-it deducts credits when it INVOICES, ~the 10th
        // of the next month) — a silent June/July does not mean the pool
        // stopped burning. Fall back to the latest witnessed month, marked
        // stale and flagged, rather than showing a dead pool.
        const latestBurnMonth = [
            ...(burnMonths.get(row.vendor) ?? new Map()),
        ].sort((a, b) => b[0].localeCompare(a[0]))[0];
        if (row.currentMonthBurnUsd > 0) {
            const elapsedDays = Math.max(1, now.getUTCDate());
            row.monthlyRateUsd =
                (row.currentMonthBurnUsd / elapsedDays) * AVG_DAYS_PER_MONTH;
            row.rateBasis = "current";
        } else if (row.lastMonthBurnUsd > 0) {
            row.monthlyRateUsd = row.lastMonthBurnUsd;
            row.rateBasis = "last";
        } else if (!row.finished && latestBurnMonth) {
            row.monthlyRateUsd = latestBurnMonth[1];
            row.rateBasis = "stale";
            row.flags.push(
                `no burn data since ${monthLabel(latestBurnMonth[0])}`,
            );
        }

        if (!row.finished) {
            let burnDate: string | null = null;
            if (row.monthlyRateUsd && row.remainingUsd > 0) {
                // remainingUsd is the last full-month close minus this
                // month's witnessed burn, so this projects from today.
                const days =
                    (row.remainingUsd / row.monthlyRateUsd) *
                    AVG_DAYS_PER_MONTH;
                burnDate = new Date(now.getTime() + days * 86_400_000)
                    .toISOString()
                    .slice(0, 10);
            }
            const upcomingExpiry =
                row.grants
                    .map((grant) => grant.expires)
                    .filter(
                        (expiry): expiry is string =>
                            expiry != null && expiry >= today,
                    )
                    .sort()[0] ?? null;
            if (burnDate && (!upcomingExpiry || burnDate <= upcomingExpiry)) {
                row.depletionDate = burnDate;
                row.depletionReason = "burn";
            } else if (upcomingExpiry) {
                row.depletionDate = upcomingExpiry;
                row.depletionReason = "expiry";
            }
        }

        if (row.grants.some((grant) => grant.startDate < "2026-01-01")) {
            row.flags.push("pre-window burn unwitnessed");
        }
        if (row.lapsedUsd > POOL_EPS_USD) {
            row.flags.push(`lapsed ${Math.round(row.lapsedUsd)}`);
        }
        if (row.unallocatedUsd > POOL_EPS_USD) {
            row.flags.push(
                `unallocated burn ${Math.round(row.unallocatedUsd)}`,
            );
        }
    }

    return [...byVendor.values()].sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? 1 : -1;
        if (a.finished) {
            return (b.finishedDate ?? "").localeCompare(a.finishedDate ?? "");
        }
        if (a.depletionDate == null && b.depletionDate == null) {
            return b.burnedUsd - a.burnedUsd;
        }
        if (a.depletionDate == null) return 1;
        if (b.depletionDate == null) return -1;
        return (
            a.depletionDate.localeCompare(b.depletionDate) ||
            a.remainingUsd - b.remainingUsd
        );
    });
}

export type UngrantedBurnRow = {
    vendor: string;
    burnedUsd: number;
    lastMonthBurnUsd: number;
    currentMonthBurnUsd: number;
};

// Credit burn from vendors with NO grant row — either a missing grant fact
// (record it) or per-invoice discounts that never formed a pool (alibaba
// coupons). Pollen-priced free partners are excluded: their "credit" is our
// own bookkeeping, not a pool that can run dry.
export function ungrantedCreditBurn(data: Data, now: Date): UngrantedBurnRow[] {
    const currentMonth = now.toISOString().slice(0, 7);
    const lastMonth = monthShift(currentMonth, -1);
    const granted = new Set(data.grants.map((grant) => grant.vendor));

    const byVendor = new Map<string, UngrantedBurnRow>();
    for (const row of data.providerMonthly) {
        if (granted.has(row.vendor)) continue;
        if (POLLEN_PRICED_VENDORS.has(row.vendor)) continue;
        const credit = toUsd(row.credit, row.currency, row.month);
        if (credit <= 0) continue;
        const entry = byVendor.get(row.vendor) ?? {
            vendor: row.vendor,
            burnedUsd: 0,
            lastMonthBurnUsd: 0,
            currentMonthBurnUsd: 0,
        };
        entry.burnedUsd += credit;
        if (row.month === lastMonth) entry.lastMonthBurnUsd += credit;
        if (row.month === currentMonth) entry.currentMonthBurnUsd += credit;
        byVendor.set(row.vendor, entry);
    }
    return [...byVendor.values()].sort((a, b) => b.burnedUsd - a.burnedUsd);
}

export type EcosystemTotals = { byopUsd: number; modelUsd: number };

// Product-adoption signal: everything credited onward to app developers
// (byop) and community model owners (model), paid + quests, in scope.
export function ecosystemTotals(
    rows: PollenMonthlyRow[],
    monthFilter: string,
): EcosystemTotals {
    let byop = 0;
    let model = 0;
    for (const row of rows) {
        if (!matchesMonth(row.month, monthFilter)) continue;
        byop += toUsd(row.byop_paid + row.byop_quests, row.currency, row.month);
        model += toUsd(
            row.model_paid + row.model_quests,
            row.currency,
            row.month,
        );
    }
    return { byopUsd: byop, modelUsd: model };
}
