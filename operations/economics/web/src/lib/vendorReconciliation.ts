import type { Data, OpTransactionRow } from "../types";
import {
    cloudCategory,
    isBankMovement,
    transactionCategory,
} from "./categories";
import {
    opCloudCreditBurnUsd,
    opCloudMonth,
    opCloudPaidBurnUsd,
} from "./computeLedger";
import { toUsd } from "./fx";
import { monthShift, WINDOW_START } from "./months";
import { isPrepaidVendor } from "./providerFunding";
import {
    type MeteringBasis,
    meterDriftExplanation,
    type ProviderReconciliationExplanation,
    pollenWitnessExplanation,
    providerMeteringBasis,
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

// ------------------------------------------------------ vendor three-way

// Vendors funded by prepaid balance top-ups: cash precedes usage by more
// than a month, so monthly cash matching is meaningless — coverage holds as
// long as cumulative cash keeps up with cumulative paid burn.
// Pollen activity below this is noise, not a funding question.
const POLLEN_ACTIVE_USD = 1;

// Provider paid amounts at or below this never raise funding warnings.
const PROVIDER_PAID_FLOOR_USD = 1;

// Slack for prepaid cumulative matching (FX drift, fees, cents).
const PREPAID_EPS_USD = 50;

type OpCloudWitness = {
    paidUsd: number;
    creditUsd: number;
    cloudUsd: number;
    meterCloudUsd: number;
};

type OpPollenWitness = {
    paidCostUsd: number;
    questCostUsd: number;
    totalCostUsd: number;
};

type CashCoverage =
    | "same month"
    | "cash ±1mo"
    | "prepaid"
    | "credit funded"
    | "missing cash"
    | null;

type MeterCoverage = "complete" | "missing cloud" | "missing pollen" | null;

export type DataQualityStatus =
    | "ok"
    | "explained"
    | "cash only"
    | "timing"
    | "missing cash"
    | "missing cloud"
    | "missing pollen"
    | "variance"
    | "drift";

export type VendorPlanes = {
    month: string;
    vendor: string;
    meteringBasis: MeteringBasis;
    cashUsd: number | null;
    cloudPaidUsd: number | null;
    cloudCreditUsd: number | null;
    cloudUsd: number | null;
    meterCloudUsd: number | null;
    pollenPaidCostUsd: number | null;
    pollenQuestCostUsd: number | null;
    pollenCostUsd: number | null;
    calibX: number | null;
    cashCoverage: CashCoverage;
    meterCoverage: MeterCoverage;
    reconciliationExplanation: ProviderReconciliationExplanation | null;
    status: DataQualityStatus;
};

function nonZeroOrNull(value: number): number | null {
    return Math.abs(value) > 0.0001 ? value : null;
}

function activePositive(value: number | null, floor: number): boolean {
    return value != null && value > floor;
}

// Paid cloud burn must be funded by Wise cash: same-month cash, an adjacent
// invoice settlement, or a prepaid balance whose cumulative top-ups cover
// cumulative paid burn. Credit-funded burn is valid without cash.
function cashCoverageFor({
    cash,
    cashUsd,
    cloudCreditUsd,
    cloudPaidUsd,
    cumulative,
    month,
    vendor,
}: {
    cash: Map<string, number>;
    cashUsd: number | null;
    cloudCreditUsd: number | null;
    cloudPaidUsd: number | null;
    cumulative: Map<string, { cashUsd: number; paidUsd: number }>;
    month: string;
    vendor: string;
}): CashCoverage {
    const paidActive = activePositive(cloudPaidUsd, PROVIDER_PAID_FLOOR_USD);
    const creditActive = activePositive(
        cloudCreditUsd,
        PROVIDER_PAID_FLOOR_USD,
    );
    const sameMonthCash = activePositive(cashUsd, PROVIDER_PAID_FLOOR_USD);
    const cashNear =
        (cash.get(`${monthShift(month, -1)}|${vendor}`) ?? 0) >
            PROVIDER_PAID_FLOOR_USD ||
        (cash.get(`${monthShift(month, 1)}|${vendor}`) ?? 0) >
            PROVIDER_PAID_FLOOR_USD;

    if (!paidActive) {
        if (creditActive) return "credit funded";
        if (sameMonthCash && isPrepaidVendor(vendor)) return "prepaid";
        return null;
    }

    if (sameMonthCash) return "same month";
    if (cashNear) return "cash ±1mo";

    if (isPrepaidVendor(vendor)) {
        const run = cumulative.get(`${month}|${vendor}`);
        const funded =
            run != null && run.cashUsd + PREPAID_EPS_USD >= run.paidUsd;
        if (funded) return "prepaid";
    }

    return "missing cash";
}

// Raw month ratio: what $1 of our metering cost at the provider that month.
function monthCalib(
    meterCloudUsd: number | null,
    pollenCostUsd: number | null,
): number | null {
    if (meterCloudUsd == null || pollenCostUsd == null || pollenCostUsd === 0)
        return null;
    return meterCloudUsd / pollenCostUsd;
}

function meterCoverageFor({
    cashCoverage,
    cashUsd,
    cloudCreditUsd,
    cloudPaidUsd,
    expectsCloudMeter,
    meterCloudUsd,
    pollenPriced,
    pollenCostUsd,
}: {
    cashCoverage: CashCoverage;
    cashUsd: number | null;
    cloudCreditUsd: number | null;
    cloudPaidUsd: number | null;
    expectsCloudMeter: boolean;
    meterCloudUsd: number | null;
    pollenPriced: boolean;
    pollenCostUsd: number | null;
}): MeterCoverage {
    const cashActive = activePositive(cashUsd, PROVIDER_PAID_FLOOR_USD);
    const cloudLedgerActive =
        activePositive(cloudPaidUsd, PROVIDER_PAID_FLOOR_USD) ||
        activePositive(cloudCreditUsd, PROVIDER_PAID_FLOOR_USD);
    const meterCloudPresent = meterCloudUsd != null;
    const pollenPresent = pollenCostUsd != null;
    const meterCloudActive = activePositive(meterCloudUsd, POLLEN_ACTIVE_USD);
    const pollenActive = activePositive(pollenCostUsd, POLLEN_ACTIVE_USD);

    // Thresholds suppress one-sided noise; they must not erase a real witness.
    // If both ledgers contain a non-zero value, coverage is complete even when
    // one side is below $1 (for example a low-volume model or calibration gap).
    if (meterCloudPresent && pollenPresent) return "complete";
    // These providers are intentionally priced from the Pollen ledger itself;
    // there is no separate external provider bill to witness.
    if (pollenPriced && pollenPresent) return "complete";
    if (
        !meterCloudPresent &&
        (pollenActive ||
            (expectsCloudMeter &&
                cashActive &&
                !cloudLedgerActive &&
                cashCoverage !== "prepaid"))
    )
        return "missing cloud";
    if (meterCloudActive && !pollenPresent) return "missing pollen";
    return null;
}

function dataQualityStatus({
    calibX,
    cashCoverage,
    cashUsd,
    cloudCreditUsd,
    cloudPaidUsd,
    meterCloudUsd,
    meterCoverage,
    meteringBasis,
    pollenCostUsd,
}: {
    calibX: number | null;
    cashCoverage: CashCoverage;
    cashUsd: number | null;
    cloudCreditUsd: number | null;
    cloudPaidUsd: number | null;
    meterCloudUsd: number | null;
    meterCoverage: MeterCoverage;
    meteringBasis: MeteringBasis;
    pollenCostUsd: number | null;
}): DataQualityStatus {
    if (cashCoverage === "missing cash") return "missing cash";
    if (meterCoverage === "missing cloud") return "missing cloud";
    if (meterCoverage === "missing pollen") return "missing pollen";
    if (hasCalibDrift({ calibX, meterCloudUsd, pollenCostUsd })) {
        return meteringBasis === "direct" ? "drift" : "variance";
    }
    if (cashCoverage === "cash ±1mo" || cashCoverage === "prepaid")
        return "timing";
    if (
        activePositive(cashUsd, PROVIDER_PAID_FLOOR_USD) &&
        !activePositive(cloudPaidUsd, PROVIDER_PAID_FLOOR_USD) &&
        !activePositive(cloudCreditUsd, PROVIDER_PAID_FLOOR_USD) &&
        !activePositive(meterCloudUsd, POLLEN_ACTIVE_USD) &&
        !activePositive(pollenCostUsd, POLLEN_ACTIVE_USD)
    )
        return "cash only";
    return "ok";
}

// One cloud spend, three OP witnesses: transactions (Wise cash), cloud
// (vendor/provider billing), and pollen (our product meter). A missing
// witness stays null, never zero.
export function vendorPlanes(data: Data): VendorPlanes[] {
    const cash = new Map<string, number>();
    const cloudMeterVendors = new Set<string>();
    const displayKeys = new Set<string>();
    const cumulativeKeys = new Set<string>();
    const infraCloudKeys = new Set<string>();
    const nonInfraCloudKeys = new Set<string>();
    for (const row of (data.opTransactions ?? []).filter(isBankMovement)) {
        if (transactionCategory(row) !== "compute") continue;
        const month = row.date.slice(0, 7);
        if (!MONTH_KEY_RE.test(month)) continue;
        const key = `${month}|${row.vendor}`;
        cash.set(key, (cash.get(key) ?? 0) - opTransactionUsd(row));
        cumulativeKeys.add(key);
    }

    const cloud = new Map<string, OpCloudWitness>();
    for (const row of data.opCloud ?? []) {
        // Community rows are publisher rewards, not an external provider bill.
        // Their OP Pollen provider cost is deliberately normalized to zero.
        if (row.vendor === "community") continue;
        const month = opCloudMonth(row);
        if (!MONTH_KEY_RE.test(month)) continue;
        const key = `${month}|${row.vendor}`;
        const category = cloudCategory(row);
        if (category === "infrastructure") {
            infraCloudKeys.add(key);
            continue;
        }
        if (category !== "compute") continue;
        const paidUsd = opCloudPaidBurnUsd(row);
        const creditUsd = opCloudCreditBurnUsd(row);
        const cloudUsd = paidUsd + creditUsd;
        const meterCloudUsd = cloudUsd;
        if (Math.abs(meterCloudUsd) > POLLEN_ACTIVE_USD) {
            cloudMeterVendors.add(row.vendor);
        }
        if (
            Math.abs(paidUsd) <= 0.0001 &&
            Math.abs(creditUsd) <= 0.0001 &&
            Math.abs(meterCloudUsd) <= 0.0001
        ) {
            continue;
        }
        const entry = getOrInit(cloud, key, () => ({
            paidUsd: 0,
            creditUsd: 0,
            cloudUsd: 0,
            meterCloudUsd: 0,
        }));
        entry.paidUsd += paidUsd;
        entry.creditUsd += creditUsd;
        entry.cloudUsd += cloudUsd;
        entry.meterCloudUsd += meterCloudUsd;
        nonInfraCloudKeys.add(key);
        cumulativeKeys.add(key);
        if (month >= WINDOW_START) displayKeys.add(key);
    }

    const pollen = new Map<string, OpPollenWitness>();
    for (const row of data.opPollen ?? []) {
        if (!MONTH_KEY_RE.test(row.month) || row.month < WINDOW_START) continue;
        // Community has no external provider bill to reconcile on this tab.
        if (row.vendor === "community") continue;
        const key = `${row.month}|${row.vendor}`;
        const entry = getOrInit(pollen, key, () => ({
            paidCostUsd: 0,
            questCostUsd: 0,
            totalCostUsd: 0,
        }));
        entry.paidCostUsd += toUsd(row.cost_paid, row.currency, row.month);
        entry.questCostUsd += toUsd(row.cost_quests, row.currency, row.month);
        entry.totalCostUsd += toUsd(
            row.cost_paid + row.cost_quests,
            row.currency,
            row.month,
        );
        if (entry.totalCostUsd > POLLEN_ACTIVE_USD) {
            cloudMeterVendors.add(row.vendor);
        }
        displayKeys.add(key);
    }

    for (const key of infraCloudKeys) {
        if (!nonInfraCloudKeys.has(key) && !pollen.has(key)) {
            displayKeys.delete(key);
        }
    }

    // Running cash vs paid burn per vendor, for prepaid-balance coverage.
    const cumulative = new Map<string, { cashUsd: number; paidUsd: number }>();
    const monthsByVendor = new Map<string, string[]>();
    for (const key of cumulativeKeys) {
        const [month, vendor] = key.split("|");
        getOrInit(monthsByVendor, vendor, (): string[] => []).push(month);
    }
    for (const [vendor, months] of monthsByVendor) {
        let cashUsd = 0;
        let paidUsd = 0;
        for (const month of months.sort()) {
            const key = `${month}|${vendor}`;
            cashUsd += cash.get(key) ?? 0;
            const entry = cloud.get(key);
            if (entry) paidUsd += Math.max(0, entry.paidUsd);
            cumulative.set(key, { cashUsd, paidUsd });
        }
    }

    return [...displayKeys].sort().map((key) => {
        const [month, vendor] = key.split("|");
        const meteringBasis = providerMeteringBasis(vendor);
        const cloudEntry = cloud.get(key);
        const cloudPaidUsd = cloudEntry
            ? nonZeroOrNull(cloudEntry.paidUsd)
            : null;
        const cloudCreditUsd = cloudEntry
            ? nonZeroOrNull(cloudEntry.creditUsd)
            : null;
        const cloudUsd = cloudEntry ? nonZeroOrNull(cloudEntry.cloudUsd) : null;
        const meterCloudUsd = cloudEntry
            ? nonZeroOrNull(cloudEntry.meterCloudUsd)
            : null;
        const pollenEntry = pollen.get(key);
        const pollenPaidCostUsd = pollenEntry
            ? nonZeroOrNull(pollenEntry.paidCostUsd)
            : null;
        const pollenQuestCostUsd = pollenEntry
            ? nonZeroOrNull(pollenEntry.questCostUsd)
            : null;
        const pollenCostUsd = pollenEntry
            ? nonZeroOrNull(pollenEntry.totalCostUsd)
            : null;
        const cashUsd = cash.get(key) ?? null;
        const cashCoverage = cashCoverageFor({
            cash,
            cashUsd,
            cloudCreditUsd,
            cloudPaidUsd,
            cumulative,
            month,
            vendor,
        });
        const meterCoverage = meterCoverageFor({
            cashCoverage,
            cashUsd,
            cloudCreditUsd,
            cloudPaidUsd,
            expectsCloudMeter: cloudMeterVendors.has(vendor),
            meterCloudUsd,
            pollenPriced: meteringBasis === "internal",
            pollenCostUsd,
        });
        const calibX = monthCalib(meterCloudUsd, pollenCostUsd);
        const rawStatus = dataQualityStatus({
            calibX,
            cashCoverage,
            cashUsd,
            cloudCreditUsd,
            cloudPaidUsd,
            meterCloudUsd,
            meterCoverage,
            meteringBasis,
            pollenCostUsd,
        });
        const reconciliationExplanation =
            rawStatus === "missing pollen"
                ? (pollenWitnessExplanation(
                      month,
                      vendor,
                      data.privateConfig,
                  ) ?? null)
                : rawStatus === "drift"
                  ? (meterDriftExplanation(month, vendor, data.privateConfig) ??
                    null)
                  : null;
        return {
            month,
            vendor,
            meteringBasis,
            cashUsd,
            cloudPaidUsd,
            cloudCreditUsd,
            cloudUsd,
            meterCloudUsd,
            pollenPaidCostUsd,
            pollenQuestCostUsd,
            pollenCostUsd,
            calibX,
            cashCoverage,
            meterCoverage,
            reconciliationExplanation,
            status: reconciliationExplanation ? "explained" : rawStatus,
        };
    });
}

// ------------------------------------------------------------- economics

// Vendors priced from our own pollen records rather than an external bill.
// Their calib is 1.00 by construction, a definition rather than a measurement.
// Community has no provider cost; the Pollen usage endpoint normalizes it to 0.
// |calib − 1| beyond this marks a registry mispricing worth fixing.
export const CALIB_DRIFT_ALARM = 0.25;
export const CALIB_DRIFT_ABS_ALARM_USD = 100;

export function providerPollenGapUsd({
    meterCloudUsd,
    pollenCostUsd,
}: Pick<VendorPlanes, "meterCloudUsd" | "pollenCostUsd">): number | null {
    if (meterCloudUsd == null || pollenCostUsd == null) return null;
    return meterCloudUsd - pollenCostUsd;
}

export function hasCalibDrift({
    calibX,
    meterCloudUsd,
    pollenCostUsd,
}: Pick<VendorPlanes, "calibX" | "meterCloudUsd" | "pollenCostUsd">): boolean {
    if (calibX == null || meterCloudUsd == null || pollenCostUsd == null) {
        return false;
    }
    const gapUsd = providerPollenGapUsd({ meterCloudUsd, pollenCostUsd });
    return (
        Math.abs(calibX - 1) > CALIB_DRIFT_ALARM &&
        gapUsd != null &&
        Math.abs(gapUsd) > CALIB_DRIFT_ABS_ALARM_USD
    );
}
