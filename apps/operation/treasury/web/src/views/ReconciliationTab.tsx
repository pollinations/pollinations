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
    HeaderHint,
    RAW_OP_STICKY_HEADER,
    RawOpTableScroller,
    type SortColumn,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { fmtMultiplier, fmtUsd } from "../lib/format";
import {
    CALIB_DRIFT_ALARM,
    type DataQualityStatus,
    type VendorPlanes,
    vendorPlanes,
} from "../lib/insights";
import { matchesMonth, monthLabel } from "../lib/months";
import type { Data } from "../types";

const DATA_QUALITY_STICKY_HEADER = `${RAW_OP_STICKY_HEADER} [&_thead_tr:first-child_th]:!top-0 [&_thead_tr:first-child_th]:!z-30 [&_thead_tr:first-child_th]:h-7 [&_thead_tr:first-child_th]:py-1 [&_thead_tr:nth-child(2)_th]:!top-7`;
const SECTION_SPLIT = "shadow-[inset_-1px_0_0_var(--polli-color-border)]";

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

function GroupHeader({ children }: { children: string }) {
    return (
        <span className="block min-w-max text-center text-[10px] uppercase tracking-wide text-theme-text-soft">
            {children}
        </span>
    );
}

function MetricHeader({ children }: { children: string }) {
    return <span className="block min-w-max">{children}</span>;
}

export function visiblePlaneRows({
    month,
    rows,
    vendor,
}: {
    month: string;
    rows: VendorPlanes[];
    vendor: string;
}) {
    return rows.filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (vendor === "all" || row.vendor === vendor),
    );
}

// Problems float to the top: missing witnesses first, calibration drift second,
// timing/prepaid rows third, healthy rows last - newest month first per band.
export function planeRank(row: VendorPlanes): number {
    if (
        row.status === "missing cash" ||
        row.status === "missing cloud" ||
        row.status === "missing pollen"
    ) {
        return 0;
    }
    if (row.status === "drift") return 1;
    if (row.status === "timing") return 2;
    return 3;
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

export function ReconciliationTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const allRows = useMemo(() => vendorPlanes(data), [data]);
    const baseRows = useMemo(
        () => problemsFirst(visiblePlaneRows({ rows: allRows, month, vendor })),
        [allRows, month, vendor],
    );
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

    return (
        <RawOpTableScroller>
            <DataTable className={DATA_QUALITY_STICKY_HEADER}>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell align="center">
                            <span className="sr-only">Quality</span>
                        </TableHeaderCell>
                        <TableHeaderCell align="center">
                            <span className="sr-only">Period</span>
                        </TableHeaderCell>
                        <TableHeaderCell align="center">
                            <span className="sr-only">Vendor</span>
                        </TableHeaderCell>
                        <TableHeaderCell align="center">
                            <span className="sr-only">Transactions</span>
                        </TableHeaderCell>
                        <TableHeaderCell colSpan={3} align="center">
                            <GroupHeader>Cloud</GroupHeader>
                        </TableHeaderCell>
                        <TableHeaderCell colSpan={3} align="center">
                            <GroupHeader>Pollen</GroupHeader>
                        </TableHeaderCell>
                        <TableHeaderCell colSpan={1} align="center">
                            <GroupHeader>Checks</GroupHeader>
                        </TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell {...headerProps("status")}>
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Row-level data-quality status for this vendor-month.",
                                    tables: "op_transactions_api + op_cloud_api + op_pollen_api",
                                }}
                            >
                                <MetricHeader>Status</MetricHeader>
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("month")}>
                            <MetricHeader>Month</MetricHeader>
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("vendor")}>
                            <MetricHeader>Vendor</MetricHeader>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("cashUsd")}
                            className={SECTION_SPLIT}
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
                                <MetricHeader>Transactions</MetricHeader>
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("cloudPaidUsd")}
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
                                <MetricHeader>Paid</MetricHeader>
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("cloudCreditUsd")}
                            align="right"
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Credit-funded cloud burn. Positive grant-award rows are not counted as spend.",
                                    tables: "op_cloud_api",
                                    formula: "sum(max(0, -credit))",
                                }}
                            >
                                <MetricHeader>Credit</MetricHeader>
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("cloudUsd")}
                            className={SECTION_SPLIT}
                            align="right"
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Total OP Cloud burn for the vendor-month, including paid, credit, and infra.",
                                    tables: "op_cloud_api",
                                    formula:
                                        "cloud_paid_usd + cloud_credit_usd",
                                }}
                            >
                                <MetricHeader>Total</MetricHeader>
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("pollenPaidCostUsd")}
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
                                <MetricHeader>Paid</MetricHeader>
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
                                <MetricHeader>Quest</MetricHeader>
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("pollenCostUsd")}
                            className={SECTION_SPLIT}
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
                                <MetricHeader>Total</MetricHeader>
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            {...headerProps("calibX")}
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
                                <MetricHeader>Calib x</MetricHeader>
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
                            <TableCell
                                className={`text-right ${SECTION_SPLIT}`}
                            >
                                {fmtUsd(row.cashUsd)}
                            </TableCell>
                            <TableCell className="text-right">
                                {fmtUsd(row.cloudPaidUsd)}
                            </TableCell>
                            <TableCell className="text-right text-theme-text-soft">
                                {fmtUsd(row.cloudCreditUsd)}
                            </TableCell>
                            <TableCell
                                className={`text-right ${SECTION_SPLIT}`}
                            >
                                {fmtUsd(row.cloudUsd)}
                            </TableCell>
                            <TableCell className="text-right">
                                {fmtUsd(row.pollenPaidCostUsd)}
                            </TableCell>
                            <TableCell className="text-right text-theme-text-soft">
                                {fmtUsd(row.pollenQuestCostUsd)}
                            </TableCell>
                            <TableCell
                                className={`text-right ${SECTION_SPLIT}`}
                            >
                                {fmtUsd(row.pollenCostUsd)}
                            </TableCell>
                            <TableCell
                                className={`text-right ${
                                    row.calibX != null &&
                                    Math.abs(row.calibX - 1) > CALIB_DRIFT_ALARM
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
        </RawOpTableScroller>
    );
}
