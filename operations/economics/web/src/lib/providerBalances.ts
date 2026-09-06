import type { Data, OpCloudRow, OpTransactionRow } from "../types";
import {
    isBankMovement,
    isComputeOrInfrastructureCategory,
    transactionCategory,
} from "./categories";
import {
    isOpCloudBalanceRow,
    opCloudCreditBurnUsd,
    opCloudMonth,
    opCloudPaidBurnUsd,
} from "./computeLedger";
import { toUsd } from "./fx";
import { monthLabel, monthShift, WINDOW_START } from "./months";
import { isPrepaidVendor } from "./providerFunding";
import {
    activeProviderAccounts,
    PROVIDER_REGISTRY,
    type ProviderAccessTarget,
    type ProviderCollectionMethod,
    resolveProvider,
} from "./providerRegistry";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function getOrInit<K, V>(map: Map<K, V>, key: K, make: () => V): V {
    let value = map.get(key);
    if (value === undefined) {
        value = make();
        map.set(key, value);
    }
    return value;
}

function opTransactionUsd(row: OpTransactionRow): number {
    return toUsd(row.amount, row.currency, row.date);
}

type GrantStatus = {
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
    preWindowBurnUsd: number;
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

const PRE_WINDOW_GRANT_BURN_RESOURCE = "pre-2026 grant burn";

const AVG_DAYS_PER_MONTH = 30.44;
const POOL_EPS_USD = 0.5;

function opCloudDate(value: string): string {
    return value.slice(0, 10);
}

export function isPreWindowGrantBurnRow(
    row: Pick<OpCloudRow, "credit" | "resource_name" | "start">,
): boolean {
    return (
        row.resource_name === PRE_WINDOW_GRANT_BURN_RESOURCE &&
        row.credit < 0 &&
        row.start.slice(0, 7) < WINDOW_START
    );
}

function opCloudGrantStatuses(data: Data): GrantStatus[] {
    const grants: GrantStatus[] = [];
    for (const row of data.opCloud ?? []) {
        if (isOpCloudBalanceRow(row)) continue;
        const grantedUsd = Math.max(
            0,
            toUsd(row.credit, row.currency, row.start),
        );
        if (grantedUsd <= 0) continue;
        grants.push({
            vendor: row.vendor,
            label: row.resource_name,
            grantedUsd,
            startDate: opCloudDate(row.start),
            expires: row.end ? opCloudDate(row.end) : null,
            allocatedUsd: 0,
            lapsedUsd: 0,
            active: true,
            finishedDate: null,
        });
    }
    grants.sort(
        (a, b) =>
            a.vendor.localeCompare(b.vendor) ||
            a.startDate.localeCompare(b.startDate) ||
            a.label.localeCompare(b.label),
    );
    return grants;
}

function opCloudBurnByVendorMonth(data: Data) {
    // plugUsd is the slice of creditUsd from explicit "pre-2026 grant burn"
    // opening-balance rows — the only burn allowed to consume grants whose
    // start metadata postdates it.
    const byVendor = new Map<
        string,
        Map<string, { creditUsd: number; paidUsd: number; plugUsd: number }>
    >();
    for (const row of data.opCloud ?? []) {
        const month = opCloudMonth(row);
        if (!MONTH_KEY_RE.test(month)) continue;
        const creditUsd = opCloudCreditBurnUsd(row);
        const paidUsd = opCloudPaidBurnUsd(row);
        if (creditUsd <= 0 && paidUsd <= 0) continue;
        const months = getOrInit(
            byVendor,
            row.vendor,
            () =>
                new Map<
                    string,
                    { creditUsd: number; paidUsd: number; plugUsd: number }
                >(),
        );
        const entry = getOrInit(months, month, () => ({
            creditUsd: 0,
            paidUsd: 0,
            plugUsd: 0,
        }));
        entry.creditUsd += creditUsd;
        entry.paidUsd += paidUsd;
        if (isPreWindowGrantBurnRow(row)) entry.plugUsd += creditUsd;
    }
    return byVendor;
}

// Allocate each vendor's monthly credit burn to its grants. Pass 1 respects
// each grant's active window (start month ≤ burn month ≤ expiry month),
// oldest grant first — so an expired grant only absorbs burn from its own
// lifetime and its unused remainder LAPSES. Pass 2 re-allocates leftover to
// non-expired grants that had already started by the burn month — burn can
// never consume credit granted later, except the explicit "pre-2026 grant
// burn" opening plugs whose dates predate grant metadata by construction.
// What still doesn't fit is real unallocated burn. Exhaustion (allocated ≈
// granted) marks a grant inactive and records the month it filled.
export function allocateGrants(
    data: Data,
    now: Date,
): { grants: GrantStatus[]; unallocated: Map<string, number> } {
    const today = now.toISOString().slice(0, 10);

    const byVendor = new Map<string, GrantStatus[]>();
    for (const grant of opCloudGrantStatuses(data)) {
        getOrInit(byVendor, grant.vendor, (): GrantStatus[] => []).push(grant);
    }
    for (const list of byVendor.values()) {
        list.sort(
            (a, b) =>
                a.startDate.localeCompare(b.startDate) ||
                a.label.localeCompare(b.label),
        );
    }

    const burnByVendorMonth = opCloudBurnByVendorMonth(data);

    const fillMonth = new Map<GrantStatus, string>();
    const unallocated = new Map<string, number>();
    for (const [vendor, grants] of byVendor) {
        const months = [
            ...(burnByVendorMonth.get(vendor) ?? new Map()).entries(),
        ].sort((a, b) => a[0].localeCompare(b[0]));
        const overflowByMonth: [string, number, number][] = [];
        for (const [month, burn] of months) {
            let left = burn.creditUsd;
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
            if (left > 0) {
                // pass 1 consumed ordinary burn first, so the leftover is
                // plug-first up to the month's plug amount
                const plugLeft = Math.min(left, burn.plugUsd);
                overflowByMonth.push([month, left - plugLeft, plugLeft]);
            }
        }
        // Pass 2: leftover into non-expired grants that already existed at
        // burn time — burn cannot consume credit granted later. The one
        // exception is the explicit "pre-2026 grant burn" opening plug,
        // whose date predates grant metadata by construction; only its
        // amount may spill onto any non-expired grant.
        let overflow = 0;
        for (const [month, ordinaryLeft, plugLeft] of overflowByMonth) {
            for (const [amount, plug] of [
                [plugLeft, true],
                [ordinaryLeft, false],
            ] as const) {
                let left = amount;
                for (const grant of grants) {
                    if (left <= 0) break;
                    if (grant.expires && grant.expires < today) continue;
                    if (!plug && grant.startDate.slice(0, 7) > month) {
                        continue;
                    }
                    const capacity = grant.grantedUsd - grant.allocatedUsd;
                    if (capacity <= 0) continue;
                    const take = Math.min(capacity, left);
                    grant.allocatedUsd += take;
                    left -= take;
                    if (grant.grantedUsd - grant.allocatedUsd <= POOL_EPS_USD) {
                        const latest = months[months.length - 1];
                        if (latest && !fillMonth.has(grant)) {
                            fillMonth.set(grant, latest[0]);
                        }
                    }
                }
                overflow += left;
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
        const row = getOrInit(byVendor, grant.vendor, () => ({
            vendor: grant.vendor,
            grantedUsd: 0,
            burnedUsd: 0,
            remainingUsd: 0,
            lapsedUsd: 0,
            unallocatedUsd: unallocated.get(grant.vendor) ?? 0,
            preWindowBurnUsd: 0,
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
        }));
        row.grantedUsd += grant.grantedUsd;
        row.lapsedUsd += grant.lapsedUsd;
        if (!(grant.expires != null && grant.expires < today)) {
            row.remainingUsd += Math.max(
                grant.grantedUsd - grant.allocatedUsd,
                0,
            );
        }
        row.grants.push(grant);
    }

    const burnByVendorMonth = opCloudBurnByVendorMonth(data);
    for (const [vendor, months] of burnByVendorMonth) {
        const entry = byVendor.get(vendor);
        if (!entry) continue;
        for (const [month, burn] of months) {
            if (burn.creditUsd > 0) {
                entry.burnedUsd += burn.creditUsd;
                if (month < WINDOW_START) {
                    entry.preWindowBurnUsd += burn.creditUsd;
                }
                if (month === lastMonth) {
                    entry.lastMonthBurnUsd += burn.creditUsd;
                }
                if (month === currentMonth) {
                    entry.currentMonthBurnUsd += burn.creditUsd;
                }
            }
            if (burn.paidUsd > 0) {
                if (month === lastMonth) entry.cashLastMonthUsd += burn.paidUsd;
                if (month === currentMonth) {
                    entry.cashCurrentMonthUsd += burn.paidUsd;
                }
            }
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
            ...(burnByVendorMonth.get(row.vendor) ?? new Map()).entries(),
        ]
            .filter((entry) => entry[1].creditUsd > 0)
            .sort((a, b) => b[0].localeCompare(a[0]))[0];
        if (row.currentMonthBurnUsd > 0) {
            const elapsedDays = Math.max(1, now.getUTCDate());
            row.monthlyRateUsd =
                (row.currentMonthBurnUsd / elapsedDays) * AVG_DAYS_PER_MONTH;
            row.rateBasis = "current";
        } else if (row.lastMonthBurnUsd > 0) {
            row.monthlyRateUsd = row.lastMonthBurnUsd;
            row.rateBasis = "last";
        } else if (!row.finished && latestBurnMonth) {
            row.monthlyRateUsd = latestBurnMonth[1].creditUsd;
            row.rateBasis = "stale";
            row.flags.push(
                `no burn data since ${monthLabel(latestBurnMonth[0])}`,
            );
        }

        if (!row.finished) {
            // Walk the remaining capacity in expiry order: burn drains the
            // earliest-expiring parcel first, and whatever is left of a
            // parcel at its expiry lapses. The pool runs out when burn
            // empties the last parcel or the last parcel lapses — an early
            // expiry alone does not end a pool that has later grants.
            const perDayUsd = row.monthlyRateUsd
                ? row.monthlyRateUsd / AVG_DAYS_PER_MONTH
                : null;
            const parcels = row.grants
                .filter(
                    (grant) =>
                        !(grant.expires != null && grant.expires < today),
                )
                .map((grant) => ({
                    expiresMs: grant.expires
                        ? Date.parse(grant.expires)
                        : Number.POSITIVE_INFINITY,
                    remainingUsd: Math.max(
                        grant.grantedUsd - grant.allocatedUsd,
                        0,
                    ),
                }))
                .filter((parcel) => parcel.remainingUsd > 0)
                .sort((a, b) => a.expiresMs - b.expiresMs);
            let atMs = now.getTime();
            let reason: RunwayRow["depletionReason"] = null;
            for (const parcel of parcels) {
                if (perDayUsd) {
                    const burnMs =
                        (parcel.remainingUsd / perDayUsd) * 86_400_000;
                    if (atMs + burnMs <= parcel.expiresMs) {
                        atMs += burnMs;
                        reason = "burn";
                        continue;
                    }
                }
                if (parcel.expiresMs === Number.POSITIVE_INFINITY) {
                    // no burn signal and no expiry — never runs out
                    reason = null;
                    break;
                }
                atMs = parcel.expiresMs;
                reason = "expiry";
            }
            if (reason) {
                row.depletionDate = new Date(atMs).toISOString().slice(0, 10);
                row.depletionReason = reason;
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

// ----------------------------------------------------- provider balances

export type ProviderBalanceMonth = {
    month: string;
    cashOpeningUsd: number | null;
    cashAddedUsd: number | null;
    cashUsedUsd: number | null;
    cashClosingUsd: number | null;
    creditOpeningUsd: number | null;
    creditAddedUsd: number | null;
    creditUsedUsd: number | null;
    creditLapsedUsd: number | null;
    creditClosingUsd: number | null;
};

export type ProviderBalanceRow = {
    vendor: string;
    label: string;
    active: boolean;
    balanceTracking: boolean;
    collectionMethod: ProviderCollectionMethod | null;
    access: ProviderAccessTarget[];
    cashBalanceUsd: number | null;
    creditBalanceUsd: number | null;
    balanceAsOf: string | null;
    balanceStatus:
        | "checked"
        | "partial"
        | "stale"
        | "not_checked"
        | "not_applicable"
        | "archived";
    checkedAccounts: number;
    expectedAccounts: number;
    balanceNote: string | null;
    creditDepletionDate: string | null;
    creditDepletionReason: "burn" | "expiry" | null;
    finished: boolean;
    history: ProviderBalanceMonth[];
};

type BalanceFlow = {
    addedUsd: number;
    usedUsd: number;
    lapsedUsd: number;
};

function balanceMonths(now: Date): string[] {
    const end = now.toISOString().slice(0, 7);
    const months: string[] = [];
    for (
        let month = WINDOW_START;
        month <= end && months.length < 120;
        month = monthShift(month, 1)
    ) {
        months.push(month);
    }
    return months;
}

function balanceFlow(
    flows: Map<string, Map<string, BalanceFlow>>,
    vendor: string,
    month: string,
): BalanceFlow {
    const months = getOrInit(flows, vendor, () => new Map());
    return getOrInit(months, month, () => ({
        addedUsd: 0,
        usedUsd: 0,
        lapsedUsd: 0,
    }));
}

type ProviderBalanceAnchor = {
    cashUsd: number;
    creditUsd: number;
    observedOn: string;
    creditExpiry: string | null;
    balanceNote: string | null;
};

type ProviderBalanceCoverage = Pick<
    ProviderBalanceRow,
    "balanceAsOf" | "balanceStatus" | "checkedAccounts" | "expectedAccounts"
>;

const MAX_BALANCE_SNAPSHOT_AGE_DAYS = 7;

function dateShift(date: string, days: number): string {
    const shifted = new Date(`${date}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted.toISOString().slice(0, 10);
}

function providerBalanceAnchors(
    data: Data,
    currentMonth: string,
    today: string,
): {
    anchors: Map<string, ProviderBalanceAnchor>;
    coverage: Map<string, ProviderBalanceCoverage>;
} {
    const rowsByVendorAccount = new Map<string, Map<string, OpCloudRow>>();
    for (const row of data.opCloud ?? []) {
        if (!isOpCloudBalanceRow(row)) continue;
        const observedOn = row.start.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn) || observedOn > today) {
            continue;
        }
        const accounts = getOrInit(
            rowsByVendorAccount,
            row.vendor,
            () => new Map(),
        );
        const accountId = row.account_id?.trim() || "default";
        const existing = accounts.get(accountId);
        if (
            !existing ||
            `${row.start}|${row.recorded_at}` >
                `${existing.start}|${existing.recorded_at}`
        ) {
            accounts.set(accountId, row);
        }
    }

    const anchors = new Map<string, ProviderBalanceAnchor>();
    const coverage = new Map<string, ProviderBalanceCoverage>();
    const freshSince = dateShift(today, -MAX_BALANCE_SNAPSHOT_AGE_DAYS);
    for (const [vendor, accounts] of rowsByVendorAccount) {
        const provider = resolveProvider(vendor);
        const expectedAccounts = provider
            ? activeProviderAccounts(provider, currentMonth).map(
                  (account) => account.id,
              )
            : [];
        const selected = (
            expectedAccounts.length > 0
                ? expectedAccounts.map((accountId) => accounts.get(accountId))
                : [...accounts.values()]
        ).filter((row): row is OpCloudRow => row != null);
        const freshRows = selected.filter(
            (row) => row.start.slice(0, 10) >= freshSince,
        );
        const active = provider?.monthlyReview ?? true;
        const balanceTracking = provider?.balanceTracking ?? true;
        const rows = !active || freshRows.length === 0 ? selected : freshRows;
        const expectedCount =
            expectedAccounts.length > 0
                ? expectedAccounts.length
                : accounts.size;
        const observedDates = rows.map((row) => row.start.slice(0, 10)).sort();
        const checkedAccounts = freshRows.length;
        coverage.set(vendor, {
            balanceAsOf: observedDates[0] ?? null,
            balanceStatus: !balanceTracking
                ? "not_applicable"
                : !active
                  ? "archived"
                  : checkedAccounts === 0 && selected.length > 0
                    ? "stale"
                    : checkedAccounts === 0
                      ? "not_checked"
                      : checkedAccounts < expectedCount
                        ? "partial"
                        : "checked",
            checkedAccounts,
            expectedAccounts: expectedCount,
        });
        if (rows.length === 0) continue;
        const expiries = rows
            .filter((row) => Number(row.credit) > 0 && row.end)
            .map((row) => row.end.slice(0, 10))
            .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
            .sort();
        anchors.set(vendor, {
            cashUsd: rows.reduce(
                (sum, row) => sum + toUsd(row.paid, row.currency, row.start),
                0,
            ),
            creditUsd: rows.reduce(
                (sum, row) => sum + toUsd(row.credit, row.currency, row.start),
                0,
            ),
            observedOn: observedDates[0],
            creditExpiry: expiries.at(-1) ?? null,
            balanceNote:
                rows.find((row) => row.resource_sku === "usage-quota")
                    ?.resource_name || null,
        });
    }
    return { anchors, coverage };
}

function anchoredCreditDepletion(
    anchor: ProviderBalanceAnchor,
    credit: RunwayRow | null,
    now: Date,
): Pick<ProviderBalanceRow, "creditDepletionDate" | "creditDepletionReason"> {
    if (anchor.creditUsd <= POOL_EPS_USD) {
        return { creditDepletionDate: null, creditDepletionReason: null };
    }
    const candidates: {
        date: string;
        reason: "burn" | "expiry";
    }[] = [];
    if (credit?.monthlyRateUsd && credit.monthlyRateUsd > 0) {
        const days =
            (anchor.creditUsd / credit.monthlyRateUsd) * AVG_DAYS_PER_MONTH;
        candidates.push({
            date: new Date(now.getTime() + days * 86_400_000)
                .toISOString()
                .slice(0, 10),
            reason: "burn",
        });
    }
    if (anchor.creditExpiry) {
        candidates.push({ date: anchor.creditExpiry, reason: "expiry" });
    }
    candidates.sort((a, b) => a.date.localeCompare(b.date));
    const first = candidates[0];
    return {
        creditDepletionDate: first?.date ?? null,
        creditDepletionReason: first?.reason ?? null,
    };
}

// OP Cloud balance snapshots are the only current-balance truth. Ledger flows
// remain visible without a snapshot, but they never invent a current balance.
// A partial multi-account snapshot intentionally shows only the checked
// accounts; coverage tells the UI that the total is a known minimum rather than
// a complete provider balance.
export function providerBalanceRows(
    data: Data,
    now: Date,
): ProviderBalanceRow[] {
    const today = now.toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);
    const months = balanceMonths(now);
    const { anchors, coverage } = providerBalanceAnchors(
        data,
        currentMonth,
        today,
    );
    const creditRows = creditRunway(data, now);
    const creditByVendor = new Map(
        creditRows.map((row) => [row.vendor, row] as const),
    );
    const cashFlows = new Map<string, Map<string, BalanceFlow>>();
    const creditFlows = new Map<string, Map<string, BalanceFlow>>();
    const cashVendors = new Set<string>();

    const afterAnchor = (vendor: string, date: string) => {
        const observedOn = anchors.get(vendor)?.observedOn;
        return observedOn != null && date > observedOn;
    };

    for (const row of (data.opTransactions ?? []).filter(isBankMovement)) {
        if (!isPrepaidVendor(row.vendor)) continue;
        if (!isComputeOrInfrastructureCategory(transactionCategory(row))) {
            continue;
        }
        const month = row.date.slice(0, 7);
        if (!MONTH_KEY_RE.test(month) || month > currentMonth) continue;
        if (afterAnchor(row.vendor, row.date)) continue;
        const addedUsd = -opTransactionUsd(row);
        if (Math.abs(addedUsd) <= 0.005) continue;
        balanceFlow(cashFlows, row.vendor, month).addedUsd += addedUsd;
        cashVendors.add(row.vendor);
    }

    for (const row of data.opCloud ?? []) {
        if (isOpCloudBalanceRow(row)) continue;
        const month = opCloudMonth(row);
        if (!MONTH_KEY_RE.test(month) || month > currentMonth) continue;
        if (afterAnchor(row.vendor, row.start.slice(0, 10))) continue;
        const cashUsedUsd = opCloudPaidBurnUsd(row);
        if (isPrepaidVendor(row.vendor) && Math.abs(cashUsedUsd) > 0.005) {
            balanceFlow(cashFlows, row.vendor, month).usedUsd += cashUsedUsd;
            cashVendors.add(row.vendor);
        }
        const creditUsedUsd = opCloudCreditBurnUsd(row);
        if (creditUsedUsd > 0.005) {
            balanceFlow(creditFlows, row.vendor, month).usedUsd +=
                creditUsedUsd;
        }
    }

    for (const credit of creditRows) {
        for (const grant of credit.grants) {
            if (!afterAnchor(credit.vendor, grant.startDate)) {
                balanceFlow(
                    creditFlows,
                    credit.vendor,
                    grant.startDate.slice(0, 7),
                ).addedUsd += grant.grantedUsd;
            }
            if (
                grant.lapsedUsd > 0.005 &&
                grant.expires &&
                !afterAnchor(credit.vendor, grant.expires)
            ) {
                balanceFlow(
                    creditFlows,
                    credit.vendor,
                    grant.expires.slice(0, 7),
                ).lapsedUsd += grant.lapsedUsd;
            }
        }
    }

    const vendors = new Set([
        ...creditByVendor.keys(),
        ...cashVendors,
        ...anchors.keys(),
        ...coverage.keys(),
        ...PROVIDER_REGISTRY.filter(
            (provider) =>
                provider.meteringBasis !== "internal" &&
                (provider.connector != null || provider.monthlyReview),
        ).map((provider) => provider.id),
    ]);
    const rows: ProviderBalanceRow[] = [];
    for (const vendor of vendors) {
        const definition = resolveProvider(vendor);
        if (definition?.meteringBasis === "internal") continue;
        const credit = creditByVendor.get(vendor) ?? null;
        const anchor = anchors.get(vendor) ?? null;
        const active = definition?.monthlyReview ?? true;
        const balanceTracking = definition?.balanceTracking ?? true;
        const balanceCoverage = coverage.get(vendor) ?? {
            balanceAsOf: null,
            balanceStatus: !balanceTracking
                ? ("not_applicable" as const)
                : !active
                  ? ("archived" as const)
                  : ("not_checked" as const),
            checkedAccounts: 0,
            expectedAccounts:
                definition == null
                    ? 0
                    : activeProviderAccounts(definition, currentMonth).length,
        };
        const hasCashFlows = cashVendors.has(vendor) || anchor != null;
        const hasCreditFlows = credit != null || anchor != null;
        const history = months.map(
            (month): ProviderBalanceMonth => ({
                month,
                cashOpeningUsd: anchor ? 0 : null,
                cashAddedUsd: hasCashFlows
                    ? (cashFlows.get(vendor)?.get(month)?.addedUsd ?? 0)
                    : null,
                cashUsedUsd: hasCashFlows
                    ? (cashFlows.get(vendor)?.get(month)?.usedUsd ?? 0)
                    : null,
                cashClosingUsd: anchor ? 0 : null,
                creditOpeningUsd: anchor ? 0 : null,
                creditAddedUsd: hasCreditFlows
                    ? (creditFlows.get(vendor)?.get(month)?.addedUsd ?? 0)
                    : null,
                creditUsedUsd: hasCreditFlows
                    ? (creditFlows.get(vendor)?.get(month)?.usedUsd ?? 0)
                    : null,
                creditLapsedUsd: hasCreditFlows
                    ? (creditFlows.get(vendor)?.get(month)?.lapsedUsd ?? 0)
                    : null,
                creditClosingUsd: anchor ? 0 : null,
            }),
        );

        if (anchor) {
            let closing = anchor.cashUsd;
            for (let index = history.length - 1; index >= 0; index -= 1) {
                const month = history[index];
                month.cashClosingUsd = closing;
                closing =
                    closing -
                    (month.cashAddedUsd ?? 0) +
                    (month.cashUsedUsd ?? 0);
                month.cashOpeningUsd = closing;
            }
        }

        if (anchor) {
            let closing = anchor.creditUsd;
            for (let index = history.length - 1; index >= 0; index -= 1) {
                const month = history[index];
                month.creditClosingUsd = closing;
                closing =
                    closing -
                    (month.creditAddedUsd ?? 0) +
                    (month.creditUsedUsd ?? 0) +
                    (month.creditLapsedUsd ?? 0);
                month.creditOpeningUsd = closing;
            }
        }

        const cashBalanceUsd = anchor?.cashUsd ?? null;
        const creditBalanceUsd = anchor?.creditUsd ?? null;
        const anchoredDepletion =
            anchor && balanceCoverage.balanceStatus === "checked"
                ? anchoredCreditDepletion(anchor, credit, now)
                : null;
        rows.push({
            vendor,
            label: definition?.label ?? vendor,
            active,
            balanceTracking,
            collectionMethod: definition?.collectionMethod ?? null,
            access: definition?.access ?? [],
            cashBalanceUsd,
            creditBalanceUsd,
            balanceAsOf: balanceCoverage.balanceAsOf,
            balanceStatus: balanceCoverage.balanceStatus,
            checkedAccounts: balanceCoverage.checkedAccounts,
            expectedAccounts: balanceCoverage.expectedAccounts,
            balanceNote: anchor?.balanceNote ?? null,
            creditDepletionDate:
                anchor && balanceCoverage.balanceStatus === "checked"
                    ? (anchoredDepletion?.creditDepletionDate ?? null)
                    : null,
            creditDepletionReason:
                anchor && balanceCoverage.balanceStatus === "checked"
                    ? (anchoredDepletion?.creditDepletionReason ?? null)
                    : null,
            finished:
                anchor != null &&
                Math.abs(cashBalanceUsd ?? 0) <= POOL_EPS_USD &&
                Math.abs(creditBalanceUsd ?? 0) <= POOL_EPS_USD,
            history,
        });
    }

    return rows.sort(
        (a, b) =>
            Number(b.active) - Number(a.active) ||
            Number(a.finished) - Number(b.finished) ||
            (a.creditDepletionDate ?? "9999").localeCompare(
                b.creditDepletionDate ?? "9999",
            ) ||
            a.vendor.localeCompare(b.vendor),
    );
}
