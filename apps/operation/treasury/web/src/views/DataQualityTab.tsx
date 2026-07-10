import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { StatCards, type StatItem } from "../components/StatCards";
import { fmtMultiplier, fmtUsd } from "../lib/format";
import { FX_EUR_USD_FALLBACK, fxFallbackMonths } from "../lib/fx";
import {
    CALIB_DRIFT_ABS_ALARM_USD,
    CALIB_DRIFT_ALARM,
    type DataQualityStatus,
    hasCalibDrift,
    type VendorPlanes,
    vendorPlanes,
} from "../lib/insights";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    monthLabel,
    type ValueFilter,
} from "../lib/months";
import type { Data } from "../types";

const STATUS_LABELS: Record<DataQualityStatus, string> = {
    ok: "ok",
    "cash only": "cash only",
    timing: "timing",
    "missing cash": "missing cash",
    "missing cloud": "missing cloud",
    "missing pollen": "missing pollen",
    drift: "drift",
};

const STATUS_BADGE_CLASSES: Record<DataQualityStatus, string> = {
    ok: "bg-intent-success-bg-bright/15 text-intent-success-text ring-intent-success-bg-bright/30",
    "cash only": "bg-theme-bg-active text-theme-text-soft ring-theme-border",
    timing: "bg-intent-info-bg-hover text-intent-info-text ring-intent-info-text/30",
    "missing cash":
        "bg-intent-danger-bg-light text-intent-danger-text ring-intent-danger-border/40",
    "missing cloud":
        "bg-intent-danger-bg-light text-intent-danger-text ring-intent-danger-border/40",
    "missing pollen":
        "bg-intent-danger-bg-light text-intent-danger-text ring-intent-danger-border/40",
    drift: "bg-intent-warning-bg-light text-intent-warning-text ring-intent-warning-text/25",
};

function statusHint(status: DataQualityStatus): string {
    if (status === "missing cash") {
        return "OP Cloud has paid burn, but OP Transactions has no same-month, adjacent-month, or prepaid cash witness.";
    }
    if (status === "missing cloud") {
        return "OP Pollen is active, or this vendor is normally measured in OP Cloud, but OP Cloud has no matching product witness for this month.";
    }
    if (status === "missing pollen") {
        return "OP Cloud has non-infra product burn, but OP Pollen has no matching product-meter witness.";
    }
    if (status === "drift") {
        return "OP Cloud and OP Pollen are both present, but cloud / pollen is outside the calibration tolerance.";
    }
    if (status === "timing") {
        return "The row is funded, but cash timing is off-month or prepaid.";
    }
    if (status === "cash only") {
        return "Wise cloud-category cash is present, but this vendor has no OP Cloud or OP Pollen product-meter expectation.";
    }
    return "All active OP witnesses agree well enough for this row.";
}

function statusTooltip(row: VendorPlanes): string {
    return `${statusHint(row.status)}\nCash: ${
        row.cashCoverage ?? "-"
    }\nMeter: ${row.meterCoverage ?? "-"}`;
}

function StatusCell({ row }: { row: VendorPlanes }) {
    const label = STATUS_LABELS[row.status];
    const content = (
        <span
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium leading-normal ring-1 ${STATUS_BADGE_CLASSES[row.status]}`}
        >
            {label}
        </span>
    );

    return (
        <Tooltip triggerAs="span" content={statusTooltip(row)}>
            {content}
        </Tooltip>
    );
}

const WARNING_STATUSES = new Set<DataQualityStatus>([
    "missing cash",
    "missing cloud",
    "missing pollen",
    "drift",
    "timing",
]);

const MISSING_WITNESS_STATUSES = new Set<DataQualityStatus>([
    "missing cash",
    "missing cloud",
    "missing pollen",
]);

export type DataQualitySummary = {
    total: number;
    warnings: number;
    missingWitnesses: number;
    reconciled: number;
    drift: number;
    calibrated: number;
    timing: number;
    cloudUsd: number;
    pollenUsd: number;
};

function sumKnown(rows: VendorPlanes[], field: keyof VendorPlanes): number {
    return rows.reduce((total, row) => {
        const value = row[field];
        return typeof value === "number" ? total + value : total;
    }, 0);
}

export function dataQualitySummary(rows: VendorPlanes[]): DataQualitySummary {
    const statuses = rows.reduce(
        (counts, row) =>
            counts.set(row.status, (counts.get(row.status) ?? 0) + 1),
        new Map<DataQualityStatus, number>(),
    );

    return {
        total: rows.length,
        warnings: rows.filter((row) => WARNING_STATUSES.has(row.status)).length,
        missingWitnesses: rows.filter((row) =>
            MISSING_WITNESS_STATUSES.has(row.status),
        ).length,
        reconciled: statuses.get("ok") ?? 0,
        drift: statuses.get("drift") ?? 0,
        calibrated: rows.filter((row) => row.calibX != null).length,
        timing: statuses.get("timing") ?? 0,
        cloudUsd: sumKnown(rows, "cloudUsd"),
        pollenUsd: sumKnown(rows, "pollenCostUsd"),
    };
}

export function dataQualityStatItems(
    summary: DataQualitySummary,
    fxFallback: string[] = [],
): StatItem[] {
    const total = summary.total;
    const cloudPollenGap = summary.cloudUsd - summary.pollenUsd;
    const hasRows = total > 0;

    return [
        {
            label: "Warnings",
            value: `${summary.warnings} of ${total}`,
            tone: summary.warnings > 0 ? "warn" : "pos",
            detail: "non-ok rows",
        },
        {
            label: "Missing",
            value: `${summary.missingWitnesses} of ${total}`,
            tone: summary.missingWitnesses > 0 ? "neg" : "pos",
            detail: "cash/cloud/pollen",
        },
        {
            label: "Reconciled",
            value: `${summary.reconciled} of ${total}`,
            tone: hasRows && summary.reconciled === total ? "pos" : "base",
            detail: "status ok",
        },
        {
            label: "Drift",
            value: `${summary.drift} of ${summary.calibrated}`,
            tone: summary.drift > 0 ? "warn" : "pos",
            detail: `>${Math.round(CALIB_DRIFT_ALARM * 100)}% and >${fmtUsd(CALIB_DRIFT_ABS_ALARM_USD)}`,
        },
        {
            label: "Cloud - Pollen",
            value: fmtUsd(cloudPollenGap),
            tone: Math.abs(cloudPollenGap) > 1 ? "warn" : "base",
            detail: `${fmtUsd(summary.cloudUsd)} vs ${fmtUsd(summary.pollenUsd)}`,
        },
        {
            label: "FX",
            value: fxFallback.length
                ? `${fxFallback.length} fallback`
                : "rates ok",
            tone: fxFallback.length ? "warn" : "pos",
            detail: fxFallback.length
                ? `${fxFallback.map(monthLabel).join(", ")} at ${FX_EUR_USD_FALLBACK} — append rates in fx.ts`
                : "monthly EUR rates present",
        },
    ];
}

export function visiblePlaneRows({
    month,
    rows,
    vendor,
}: {
    month: MonthFilterValue;
    rows: VendorPlanes[];
    vendor: ValueFilter;
}) {
    return rows.filter(
        (row) =>
            matchesMonth(row.month, month) && matchesValue(row.vendor, vendor),
    );
}

// Product meter gaps are the highest-risk rows, then cash gaps, then material
// calibration drift, timing/prepaid rows, and healthy rows.
export function planeRank(row: VendorPlanes): number {
    if (row.status === "missing cloud" || row.status === "missing pollen") {
        return 0;
    }
    if (row.status === "missing cash") return 1;
    if (row.status === "drift") return 2;
    if (row.status === "timing") return 3;
    return 4;
}

export function problemsFirst(rows: VendorPlanes[]): VendorPlanes[] {
    return [...rows].sort(
        (a, b) =>
            planeRank(a) - planeRank(b) ||
            b.month.localeCompare(a.month) ||
            a.vendor.localeCompare(b.vendor),
    );
}

function rowKey(row: VendorPlanes) {
    return `${row.month}|${row.vendor}`;
}

export function DataQualityTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const allRows = useMemo(() => vendorPlanes(data), [data]);
    const baseRows = useMemo(
        () => problemsFirst(visiblePlaneRows({ rows: allRows, month, vendor })),
        [allRows, month, vendor],
    );
    const summary = useMemo(() => dataQualitySummary(baseRows), [baseRows]);
    const fxFallback = useMemo(() => fxFallbackMonths(data), [data]);
    const sortColumns = useMemo<SortColumn<VendorPlanes>[]>(
        () => [
            { key: "status", value: (row) => planeRank(row) },
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "cashUsd", value: (row) => row.cashUsd },
            { key: "cloudPaidUsd", value: (row) => row.cloudPaidUsd },
            { key: "cloudCreditUsd", value: (row) => row.cloudCreditUsd },
            { key: "cloudUsd", value: (row) => row.cloudUsd },
            {
                key: "pollenPaidCostUsd",
                value: (row) => row.pollenPaidCostUsd,
            },
            {
                key: "pollenQuestCostUsd",
                value: (row) => row.pollenQuestCostUsd,
            },
            { key: "pollenCostUsd", value: (row) => row.pollenCostUsd },
            { key: "calibX", value: (row) => row.calibX },
        ],
        [],
    );
    // No initial sort column: rows open in data-quality priority order.
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, null);

    return [
        <div key="stats" className="mb-4">
            <StatCards items={dataQualityStatItems(summary, fxFallback)} />
        </div>,
        <TableScroller key="table">
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell rowSpan={2} {...headerProps("status")}>
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Row-level data-quality status for this vendor-month.",
                                    tables: "op_transactions_api + op_cloud_api + op_pollen_api",
                                }}
                            >
                                Status
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("month")}>
                            Month
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("vendor")}>
                            Vendor
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("cashUsd")}
                            align="right"
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "OP Transactions cloud-category rows normalized to spend. This is the Wise payment witness for the vendor-month.",
                                    tables: "op_transactions_api",
                                    formula: "-sum(amount)",
                                }}
                            >
                                Transactions
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={3}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Cloud
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={3}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Pollen
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={1}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Checks
                        </TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell
                            {...headerProps("cloudPaidUsd")}
                            className={GROUP_BORDER}
                            align="right"
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Paid cloud burn from OP Cloud. Negative ledger movements become positive burn; positive refunds reduce it.",
                                    tables: "op_cloud_api",
                                    formula: "-sum(paid)",
                                }}
                            >
                                Paid
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("cloudCreditUsd")}
                            align="right"
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Credit-funded cloud burn. Positive credit-award rows are not counted as spend.",
                                    tables: "op_cloud_api",
                                    formula: "sum(max(0, -credit))",
                                }}
                            >
                                Credit
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("cloudUsd")}
                            align="right"
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Non-infra OP Cloud burn for the vendor-month, including paid and credit-funded provider usage.",
                                    tables: "op_cloud_api",
                                    formula:
                                        "cloud_paid_usd + cloud_credit_usd",
                                }}
                            >
                                Total
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("pollenPaidCostUsd")}
                            className={GROUP_BORDER}
                            align="right"
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Provider cost for usage served through paid Pollen. This is product cost, not Wise cash.",
                                    tables: "op_pollen_api",
                                    formula: "cost_paid",
                                }}
                            >
                                Paid
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("pollenQuestCostUsd")}
                            align="right"
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Provider cost for free quest/tier usage. It is free to the user, but still costs us cloud/provider money.",
                                    tables: "op_pollen_api",
                                    formula: "cost_quests",
                                }}
                            >
                                Quest
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("pollenCostUsd")}
                            align="right"
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Total product-metered provider cost from OP Pollen. Calibration uses this total because quests also consume provider resources.",
                                    tables: "op_pollen_api",
                                    formula:
                                        "pollen_paid_cost_usd + pollen_quest_cost_usd",
                                }}
                            >
                                Total
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("calibX")}
                            className={GROUP_BORDER}
                            align="right"
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Non-infra OP Cloud burn divided by total OP Pollen product cost. Drift suggests registry or source mapping issues.",
                                    formula:
                                        "meter_cloud_usd / pollen_cost_usd",
                                }}
                            >
                                Calib x
                            </HeaderHint>
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, rowKey).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>
                                <StatusCell row={row} />
                            </TableCell>
                            <TableCell>{monthLabel(row.month)}</TableCell>
                            <TableCell>{row.vendor}</TableCell>
                            <TableCell className="text-right">
                                {fmtUsd(row.cashUsd)}
                            </TableCell>
                            <TableCell className={`text-right ${GROUP_BORDER}`}>
                                {fmtUsd(row.cloudPaidUsd)}
                            </TableCell>
                            <TableCell className="text-right text-theme-text-soft">
                                {fmtUsd(row.cloudCreditUsd)}
                            </TableCell>
                            <TableCell className="text-right">
                                {fmtUsd(row.cloudUsd)}
                            </TableCell>
                            <TableCell className={`text-right ${GROUP_BORDER}`}>
                                {fmtUsd(row.pollenPaidCostUsd)}
                            </TableCell>
                            <TableCell className="text-right text-theme-text-soft">
                                {fmtUsd(row.pollenQuestCostUsd)}
                            </TableCell>
                            <TableCell className="text-right">
                                {fmtUsd(row.pollenCostUsd)}
                            </TableCell>
                            <TableCell
                                className={`text-right ${GROUP_BORDER} ${
                                    hasCalibDrift(row)
                                        ? "text-intent-danger-text"
                                        : "text-theme-text-soft"
                                }`}
                            >
                                {fmtMultiplier(row.calibX)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>,
    ];
}
