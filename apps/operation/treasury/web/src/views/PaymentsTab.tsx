import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
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
    const rows = useMemo(
        () => sortedPayments(data.cashMonthly),
        [data.cashMonthly],
    );

    return (
        <div className="flex flex-col gap-4">
            <DataNote pipe="cash_monthly_ep" rows={rows.length}>
                Real bank outflows from Wise <SourceMark code="WS" /> grouped by
                month, provider and category — the cash side of every Recon
                verdict.
            </DataNote>
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
