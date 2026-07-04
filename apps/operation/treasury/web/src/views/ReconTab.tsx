import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { FilterBar, FilterSelect, MonthFilter } from "../components/Filters";
import { fmtUsd2 } from "../lib/format";
import { matchesMonth, monthName } from "../lib/months";
import { statusMeta } from "../lib/recon";
import type { CoverageRow, Data, GapRow } from "../types";

function sortedCoverage(rows: CoverageRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider) ||
            a.status.localeCompare(b.status),
    );
}

function gapKey(row: Pick<GapRow, "month" | "provider" | "status">) {
    return `${row.month}|${row.provider}|${row.status}`;
}

function isIssue(row: CoverageRow) {
    return statusMeta(row.status).severity > 0;
}

export function ReconTab({
    data,
    month = "",
    months = [],
    onMonthChange = () => {},
    onProviderChange = () => {},
    provider = "all",
    providers = ["all"],
}: {
    data: Data;
    month?: string;
    months?: string[];
    onMonthChange?: (value: string) => void;
    onProviderChange?: (value: string) => void;
    provider?: string;
    providers?: string[];
}) {
    const gapsByKey = useMemo(() => {
        const byKey = new Map<string, GapRow>();
        const byProviderMonth = new Map<string, GapRow>();

        for (const gap of data.gaps) {
            byKey.set(gapKey(gap), gap);
            byProviderMonth.set(`${gap.month}|${gap.provider}`, gap);
        }

        return { byKey, byProviderMonth };
    }, [data.gaps]);
    const baseCoverage = useMemo(
        () =>
            sortedCoverage(data.coverage).filter(
                (row) =>
                    isIssue(row) &&
                    matchesMonth(row.month, month) &&
                    (provider === "all" || row.provider === provider),
            ),
        [data.coverage, month, provider],
    );
    const sortColumns = useMemo<SortColumn<CoverageRow>[]>(
        () => [
            { key: "status", value: (row) => row.status },
            { key: "month", value: (row) => row.month },
            { key: "provider", value: (row) => row.provider },
            { key: "invoice_usd", value: (row) => row.invoice_usd },
            { key: "payment_usd", value: (row) => row.payment_usd },
            {
                key: "delta_usd",
                value: (row) =>
                    (
                        gapsByKey.byKey.get(gapKey(row)) ??
                        gapsByKey.byProviderMonth.get(
                            `${row.month}|${row.provider}`,
                        )
                    )?.delta_usd,
            },
        ],
        [gapsByKey],
    );
    const { headerProps, rows: coverage } = useSortableRows(
        baseCoverage,
        sortColumns,
    );

    return (
        <div className="flex flex-col gap-4">
            <FilterBar>
                <MonthFilter
                    months={months}
                    value={month}
                    onChange={onMonthChange}
                />
                <FilterSelect
                    label="provider"
                    value={provider}
                    onChange={onProviderChange}
                    options={providers}
                />
            </FilterBar>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("status")}>
                                status
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("month")}>
                                month
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("provider")}>
                                provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("invoice_usd")}>
                                invoice_usd
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("payment_usd")}>
                                payment_usd
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("delta_usd")}>
                                delta_usd
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            coverage,
                            (row) => `${row.provider}|${row.month}`,
                        ).map(({ key, row }) => {
                            const meta = statusMeta(row.status);
                            const gap =
                                gapsByKey.byKey.get(gapKey(row)) ??
                                gapsByKey.byProviderMonth.get(
                                    `${row.month}|${row.provider}`,
                                );
                            return (
                                <TableRow key={key}>
                                    <TableCell>
                                        <Chip
                                            size="sm"
                                            intent={meta.intent ?? undefined}
                                        >
                                            {row.status}
                                        </Chip>
                                    </TableCell>
                                    <TableCell>
                                        {monthName(row.month)}
                                    </TableCell>
                                    <TableCell>{row.provider}</TableCell>
                                    <TableCell>
                                        {fmtUsd2(row.invoice_usd)}
                                    </TableCell>
                                    <TableCell>
                                        {fmtUsd2(row.payment_usd)}
                                    </TableCell>
                                    <TableCell>
                                        {fmtUsd2(gap?.delta_usd)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
