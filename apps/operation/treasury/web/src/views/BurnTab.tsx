import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import { DataNote } from "../components/DataNote";
import { DataTable, TableScroller } from "../components/DataTable";
import { SourceBadge } from "../components/Provenance";
import { fmtUsd2 } from "../lib/format";
import { statusMeta } from "../lib/recon";
import type { Data, ProviderMonthRow } from "../types";

const CATEGORY_OPTIONS = [
    "all",
    "compute",
    "infra",
    "saas",
    "payroll",
    "other",
];

function sortedProviderMonths(rows: ProviderMonthRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider) ||
            a.category.localeCompare(b.category),
    );
}

function SourcePair({
    meterSrc,
    creditSrc,
}: {
    meterSrc: string;
    creditSrc: string;
}) {
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {meterSrc ? <SourceBadge source={meterSrc} /> : <span>-</span>}
            <span className="text-theme-text-soft">/</span>
            {creditSrc ? <SourceBadge source={creditSrc} /> : <span>-</span>}
        </span>
    );
}

export function BurnTab({ data }: { data: Data }) {
    const [category, setCategory] = useState("all");
    const rows = useMemo(
        () =>
            sortedProviderMonths(data.providerMonths).filter(
                (row) => category === "all" || row.category === category,
            ),
        [data.providerMonths, category],
    );

    return (
        <div className="flex flex-col gap-4">
            <DataNote
                pipe="provider_month_ep"
                rows={rows.length}
                source="IV + provider meters + balances"
                transform="Forager burn rows"
                purpose="raw monthly burn evidence by provider and category"
            />
            <label className="inline-flex w-fit items-center gap-2 text-sm text-theme-text-soft">
                category
                <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                >
                    {CATEGORY_OPTIONS.map((option) => (
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
                            <TableHeaderCell>invoice_usd</TableHeaderCell>
                            <TableHeaderCell>meter_cash_usd</TableHeaderCell>
                            <TableHeaderCell>meter_prepaid_usd</TableHeaderCell>
                            <TableHeaderCell>usage_cost_usd</TableHeaderCell>
                            <TableHeaderCell>credit_burn_usd</TableHeaderCell>
                            <TableHeaderCell>srcs</TableHeaderCell>
                            <TableHeaderCell>status</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => {
                            const meta = statusMeta(row.status);
                            return (
                                <TableRow
                                    key={`${row.month}|${row.provider}|${row.category}`}
                                >
                                    <TableCell>{row.month}</TableCell>
                                    <TableCell>{row.provider}</TableCell>
                                    <TableCell>{row.category || "-"}</TableCell>
                                    <TableCell>
                                        {fmtUsd2(row.invoice_usd)}
                                    </TableCell>
                                    <TableCell>
                                        {fmtUsd2(row.meter_cash_usd)}
                                    </TableCell>
                                    <TableCell>
                                        {fmtUsd2(row.meter_prepaid_usd)}
                                    </TableCell>
                                    <TableCell>
                                        {fmtUsd2(row.usage_cost_usd)}
                                    </TableCell>
                                    <TableCell>
                                        {fmtUsd2(row.credit_burn_usd)}
                                    </TableCell>
                                    <TableCell>
                                        <SourcePair
                                            meterSrc={row.meter_src}
                                            creditSrc={row.credit_src}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="sm"
                                            intent={meta.intent ?? undefined}
                                        >
                                            {row.status || "-"}
                                        </Chip>
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
