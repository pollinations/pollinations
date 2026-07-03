import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import { DataNote } from "../components/DataNote";
import { DataTable, TableScroller } from "../components/DataTable";
import { SourceMark } from "../components/Provenance";
import { fmtUsd2 } from "../lib/format";
import type { CashMonthlyRow, Data } from "../types";

function sortedPayments(rows: CashMonthlyRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider),
    );
}

export function PaymentsTab({ data }: { data: Data }) {
    const [category, setCategory] = useState("all");
    const categoryOptions = useMemo(() => {
        const options = new Set<string>();
        for (const row of data.cashMonthly) {
            if (row.category) options.add(row.category);
            if (row.provider === "(unmatched)") options.add("unmatched");
        }
        return ["all", ...[...options].sort()];
    }, [data.cashMonthly]);
    const rows = useMemo(
        () =>
            sortedPayments(data.cashMonthly).filter((row) => {
                if (category === "all") return true;
                if (category === "unmatched")
                    return row.provider === "(unmatched)";
                return row.category === category;
            }),
        [data.cashMonthly, category],
    );

    return (
        <div className="flex flex-col gap-4">
            <DataNote pipe="payments_monthly_ep" rows={rows.length}>
                Real bank outflows from Wise <SourceMark code="WS" /> grouped by
                month, provider and category — the cash side of every Recon
                verdict.
            </DataNote>
            <label className="inline-flex w-fit items-center gap-2 text-sm text-theme-text-soft">
                category
                <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                >
                    {categoryOptions.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            </label>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>month</TableHeaderCell>
                            <TableHeaderCell>provider</TableHeaderCell>
                            <TableHeaderCell>category</TableHeaderCell>
                            <TableHeaderCell>paid_usd</TableHeaderCell>
                            <TableHeaderCell>paid_eur</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={`${row.provider}|${row.month}`}>
                                <TableCell>{row.month}</TableCell>
                                <TableCell>
                                    {row.provider || "(unmatched)"}
                                </TableCell>
                                <TableCell>{row.category || "-"}</TableCell>
                                <TableCell>{fmtUsd2(row.paid_usd)}</TableCell>
                                <TableCell>
                                    €{row.paid_eur.toFixed(2)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
