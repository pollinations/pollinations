import {
    Chip,
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
import { StatCards } from "../components/StatCards";
import { fmtMultiplier, fmtUsd } from "../lib/format";
import {
    CALIB_DRIFT_ALARM,
    type Coverage,
    type VendorPlanes,
    vendorPlanes,
} from "../lib/insights";
import { matchesMonth, monthLabel } from "../lib/months";
import type { Data } from "../types";

// Collapse the 7-state coverage enum into 3 display buckets, keeping the exact
// raw reason in a hover tooltip. Sort/rank logic still reads the raw value.
export function coverageLabel(value: Coverage): string | null {
    if (value == null) return null;
    if (value === "uncovered") return "⚠ Unfunded";
    if (value === "paid unverified") return "⚠ Unverified";
    return "Funded";
}

function CoverageCell({ value }: { value: Coverage }) {
    const label = coverageLabel(value);
    if (label == null) return <span className="text-theme-text-soft">–</span>;
    const chip =
        value === "uncovered" || value === "paid unverified" ? (
            <Chip intent="warning" size="sm">
                {label}
            </Chip>
        ) : (
            <span className="text-theme-text-soft">{label}</span>
        );
    return (
        <Tooltip triggerAs="span" content={value}>
            {chip}
        </Tooltip>
    );
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

// Problems float to the top: funding gaps first, calibration drift second,
// healthy rows last — newest month first within each band.
export function planeRank(row: VendorPlanes): number {
    if (row.coverage === "uncovered" || row.coverage === "paid unverified")
        return 0;
    if (row.calibX != null && Math.abs(row.calibX - 1) > CALIB_DRIFT_ALARM)
        return 1;
    return 2;
}

export function problemsFirst(rows: VendorPlanes[]): VendorPlanes[] {
    return [...rows].sort(
        (a, b) =>
            planeRank(a) - planeRank(b) ||
            b.month.localeCompare(a.month) ||
            a.vendor.localeCompare(b.vendor),
    );
}

function isGap(coverage: Coverage): boolean {
    return coverage === "uncovered" || coverage === "paid unverified";
}

function planeSummary(rows: VendorPlanes[]) {
    let cashUsd = 0;
    let providerUsd = 0;
    let creditUsd = 0;
    let pollenUsd = 0;
    let gaps = 0;
    for (const row of rows) {
        cashUsd += row.transactionsUsd ?? 0;
        providerUsd += row.providerUsd ?? 0;
        creditUsd += row.creditUsd ?? 0;
        pollenUsd += row.pollenUsd ?? 0;
        if (isGap(row.coverage)) gaps += 1;
    }
    return {
        cashUsd,
        providerUsd,
        creditUsd,
        pollenUsd,
        gaps,
        rowCount: rows.length,
        calibX: pollenUsd > 0 ? providerUsd / pollenUsd : null,
    };
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
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "transactionsUsd", value: (row) => row.transactionsUsd },
            { key: "providerUsd", value: (row) => row.providerUsd },
            { key: "creditUsd", value: (row) => row.creditUsd },
            { key: "pollenUsd", value: (row) => row.pollenUsd },
            { key: "calibX", value: (row) => row.calibX },
            { key: "coverage", value: (row) => row.coverage },
        ],
        [],
    );
    // No initial sort column: rows open in problems-first order; clicking a
    // header takes over from there.
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, null);
    const stats = useMemo(() => planeSummary(baseRows), [baseRows]);
    const calibDrift =
        stats.calibX != null && Math.abs(stats.calibX - 1) > CALIB_DRIFT_ALARM;

    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "Cash sent",
                        value: fmtUsd(stats.cashUsd),
                        detail: "compute cash outflows",
                    },
                    {
                        label: "Provider",
                        value: fmtUsd(stats.providerUsd),
                        detail:
                            stats.creditUsd > 0
                                ? `${fmtUsd(stats.creditUsd)} credit`
                                : "their billing meter",
                    },
                    {
                        label: "Our Meter",
                        value: fmtUsd(stats.pollenUsd),
                        detail: "our metering",
                    },
                    {
                        label: "Blended calib ×",
                        value: fmtMultiplier(stats.calibX),
                        tone: calibDrift ? "neg" : "base",
                        detail: "provider ÷ pollen",
                    },
                    {
                        label: "Funding gaps",
                        value: String(stats.gaps),
                        tone: stats.gaps > 0 ? "warn" : "pos",
                        detail: `of ${stats.rowCount} vendor-months`,
                    },
                ]}
            />
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell colSpan={2}>
                                <span className="text-xs uppercase tracking-wide text-theme-text-soft" />
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={1}
                                className={GROUP_BORDER}
                            >
                                <span className="text-xs uppercase tracking-wide text-theme-text-soft">
                                    Bank
                                </span>
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                className={GROUP_BORDER}
                            >
                                <span className="text-xs uppercase tracking-wide text-theme-text-soft">
                                    Provider
                                </span>
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={1}
                                className={GROUP_BORDER}
                            >
                                <span className="text-xs uppercase tracking-wide text-theme-text-soft">
                                    Ours
                                </span>
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                className={GROUP_BORDER}
                            >
                                <span className="text-xs uppercase tracking-wide text-theme-text-soft">
                                    Reconcile
                                </span>
                            </TableHeaderCell>
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell {...headerProps("month")}>
                                month
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("vendor")}>
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("transactionsUsd")}
                                align="right"
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Cash actually sent to the vendor that month. Empty = no cash left the bank (credits, prepaid balance, or arrears billing).",
                                        tables: "transactions_api",
                                        sources: "EN",
                                    }}
                                >
                                    Cash
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("providerUsd")}
                                align="right"
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "What the vendor's own bill says we consumed that month (credit + paid parts). Compute rows only.",
                                        tables: "provider_monthly_api",
                                        sources: "API/CLI/BQ",
                                    }}
                                >
                                    Provider
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("creditUsd")}
                                align="right"
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "The slice of Provider consumption covered by granted credits — consumed, but no cash out.",
                                        tables: "provider_monthly_api",
                                    }}
                                >
                                    Of It Credit
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("pollenUsd")}
                                align="right"
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "What our own metering registered as cost for this vendor's models.",
                                        tables: "pollen_monthly_api",
                                        sources: "TB",
                                        formula: "cost_paid + cost_quests",
                                    }}
                                >
                                    Our Meter
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("calibX")}
                                align="right"
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Provider ÷ Our Meter for the single month. Red past drift = our registry unit price for this vendor is off.",
                                        formula: "provider ÷ our meter",
                                    }}
                                >
                                    Calib ×
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("coverage")}>
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Is this consumption funded? Funded = cash, credit, prepaid balance, or internal covers it. ⚠ Unfunded = active in our meter but no funding found. ⚠ Unverified = provider says we paid cash the bank never saw.",
                                        tables: "transactions_api + provider_monthly_api + pollen_monthly_api",
                                    }}
                                >
                                    Funding
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.month}|${row.vendor}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{monthLabel(row.month)}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell
                                    className={`text-right ${GROUP_BORDER}`}
                                >
                                    {fmtUsd(row.transactionsUsd)}
                                </TableCell>
                                <TableCell
                                    className={`text-right ${GROUP_BORDER}`}
                                >
                                    {fmtUsd(row.providerUsd)}
                                </TableCell>
                                <TableCell className="text-right text-theme-text-soft">
                                    {fmtUsd(row.creditUsd)}
                                </TableCell>
                                <TableCell
                                    className={`text-right ${GROUP_BORDER}`}
                                >
                                    {fmtUsd(row.pollenUsd)}
                                </TableCell>
                                <TableCell
                                    className={`text-right ${GROUP_BORDER} ${
                                        row.calibX != null &&
                                        Math.abs(row.calibX - 1) >
                                            CALIB_DRIFT_ALARM
                                            ? "text-intent-danger-text"
                                            : "text-theme-text-soft"
                                    }`}
                                >
                                    {fmtMultiplier(row.calibX)}
                                </TableCell>
                                <TableCell>
                                    <CoverageCell value={row.coverage} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
