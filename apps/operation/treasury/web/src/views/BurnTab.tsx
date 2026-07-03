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
import { SourceBadge, SourceMark } from "../components/Provenance";
import { UsageEntryForm } from "../components/UsageEntryForm";
import { fmtUsd2 } from "../lib/format";
import {
    queuedBalanceKey,
    queuedMeterKey,
    queuedReconKey,
} from "../lib/queued";
import { statusMeta } from "../lib/recon";
import type { Data, ProviderMonthRow } from "../types";

const CATEGORY_OPTIONS = [
    "all",
    "compute",
    "infra",
    "saas",
    "admin",
    "office",
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

export function BurnTab({
    data,
    queuedKeys = new Set<string>(),
}: {
    data: Data;
    queuedKeys?: ReadonlySet<string>;
}) {
    const [category, setCategory] = useState("all");
    const [resolveRow, setResolveRow] = useState<ProviderMonthRow | null>(null);
    const rows = useMemo(
        () =>
            sortedProviderMonths(data.providerMonths).filter(
                (row) => category === "all" || row.category === category,
            ),
        [data.providerMonths, category],
    );

    return (
        <div className="flex flex-col gap-4">
            <DataNote pipe="provider_month_ep" rows={rows.length}>
                Monthly spend per provider and category, folded from invoices{" "}
                <SourceMark code="IV" />, provider meters and balances{" "}
                <SourceMark code="API" /> and usage estimates{" "}
                <SourceMark code="TB" /> — where credit burn becomes real
                monthly cost.
            </DataNote>
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
            {resolveRow && (
                <section className="rounded border border-theme-border/70 bg-theme-bg/45 p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <span className="font-bold">
                                Resolve {resolveRow.provider} ·{" "}
                                {resolveRow.month}
                            </span>
                            <p className="mt-1 text-sm text-theme-text-soft">
                                Enter the missing monthly usage evidence or a
                                current grant balance. Derived burn changes
                                after the next forager run.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="font-medium text-theme-link hover:underline"
                            onClick={() => setResolveRow(null)}
                        >
                            close
                        </button>
                    </div>
                    <UsageEntryForm
                        month={resolveRow.month}
                        provider={resolveRow.provider}
                        onStaged={() => setResolveRow(null)}
                    />
                </section>
            )}
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
                            <TableHeaderCell>actions</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => {
                            const meta = statusMeta(row.status);
                            const queued =
                                queuedKeys.has(
                                    queuedMeterKey(row.month, row.provider),
                                ) ||
                                queuedKeys.has(
                                    queuedReconKey(row.month, row.provider),
                                ) ||
                                queuedKeys.has(queuedBalanceKey(row.provider));
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
                                        <span className="inline-flex items-center gap-1.5">
                                            <Chip
                                                size="sm"
                                                intent={
                                                    meta.intent ?? undefined
                                                }
                                            >
                                                {row.status || "-"}
                                            </Chip>
                                            {queued && (
                                                <Chip
                                                    size="sm"
                                                    intent="warning"
                                                >
                                                    queued
                                                </Chip>
                                            )}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {row.status === "needs_data" ? (
                                            <button
                                                type="button"
                                                className="font-medium text-theme-link hover:underline"
                                                onClick={() =>
                                                    setResolveRow(row)
                                                }
                                            >
                                                resolve
                                            </button>
                                        ) : (
                                            "-"
                                        )}
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
