import {
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
import { SourceCell } from "../components/Provenance";
import { fmtPeriod } from "../lib/format";
import { isYearFilter, matchesMonth } from "../lib/months";
import type { Data, ProviderMonthlyRow } from "../types";

export function visibleProviderRows({
    providerRows,
    month,
    vendor,
}: {
    providerRows: ProviderMonthlyRow[];
    month: string;
    vendor: string;
}) {
    return providerRows.filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (vendor === "all" || row.vendor === vendor),
    );
}

export function aggregateProviderByYear({
    providerRows,
    vendor,
    year,
}: {
    providerRows: ProviderMonthlyRow[];
    vendor: string;
    year: string;
}): ProviderMonthlyRow[] {
    const byKey = new Map<
        string,
        ProviderMonthlyRow & { sourceSet: Set<string> }
    >();
    for (const row of providerRows) {
        if (!matchesMonth(row.month, year)) continue;
        if (vendor !== "all" && row.vendor !== vendor) continue;

        const key = `${row.vendor}|${row.currency}`;
        const entry = byKey.get(key) ?? {
            month: year,
            source: "",
            vendor: row.vendor,
            credit: 0,
            paid: 0,
            currency: row.currency,
            sourceSet: new Set<string>(),
        };
        entry.credit += row.credit;
        entry.paid += row.paid;
        entry.sourceSet.add(row.source);
        byKey.set(key, entry);
    }
    return [...byKey.values()]
        .map(({ sourceSet, ...row }) => ({
            ...row,
            source: [...sourceSet].sort().join(","),
        }))
        .sort(
            (a, b) =>
                a.vendor.localeCompare(b.vendor) ||
                a.currency.localeCompare(b.currency),
        );
}

export function ProviderTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const baseRows = useMemo(() => {
        if (isYearFilter(month)) {
            return aggregateProviderByYear({
                providerRows: data.providerMonthly,
                vendor,
                year: month,
            });
        }
        return visibleProviderRows({
            providerRows: data.providerMonthly,
            month,
            vendor,
        });
    }, [data.providerMonthly, month, vendor]);
    const sortColumns = useMemo<SortColumn<ProviderMonthlyRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "source", value: (row) => row.source },
            { key: "vendor", value: (row) => row.vendor },
            { key: "credit", value: (row) => row.credit },
            { key: "paid", value: (row) => row.paid },
            { key: "currency", value: (row) => row.currency },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });
    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("month")}>
                            month
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("source")}>
                            source
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("vendor")}>
                            vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("credit")}>
                            credit
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("paid")}>
                            paid
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            currency
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        rows,
                        (row) =>
                            `${row.month}|${row.vendor}|${row.source}|${row.currency}|${row.credit}|${row.paid}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>{fmtPeriod(row.month)}</TableCell>
                            <TableCell>
                                <SourceCell sources={[row.source]} />
                            </TableCell>
                            <TableCell>{row.vendor}</TableCell>
                            <TableCell>{row.credit}</TableCell>
                            <TableCell>{row.paid}</TableCell>
                            <TableCell>{row.currency}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}
