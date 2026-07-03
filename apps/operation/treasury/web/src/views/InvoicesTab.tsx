import {
    CheckIcon,
    Chip,
    ClipboardIcon,
    CopyButton,
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
import type { Data, InvoiceRow } from "../types";

const CATEGORY_OPTIONS = [
    "all",
    "compute",
    "infra",
    "saas",
    "payroll",
    "other",
];

function StatusChip({ status }: { status: string }) {
    const meta = statusMeta(status);
    return (
        <Chip size="sm" intent={meta.intent ?? undefined}>
            {status}
        </Chip>
    );
}

function sortedInvoices(rows: InvoiceRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.ingested_at.localeCompare(a.ingested_at) ||
            b.period_month.localeCompare(a.period_month) ||
            a.provider.localeCompare(b.provider) ||
            a.sha256.localeCompare(b.sha256),
    );
}

function FileRefAction({ fileRef }: { fileRef: string }) {
    if (!fileRef) return <span>-</span>;

    return (
        <CopyButton
            value={fileRef}
            aria-label="Copy file reference"
            tooltip="Copy file reference"
            copiedTooltip="Copied file reference"
            className={(copied) =>
                [
                    "inline-flex h-7 w-7 items-center justify-center rounded border border-theme-border/70 bg-theme-bg/60 text-theme-text-soft transition-colors",
                    "hover:bg-theme-bg-hover hover:text-theme-text-strong",
                    copied ? "text-intent-success-text" : "",
                ].join(" ")
            }
        >
            {(copied) =>
                copied ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                    <ClipboardIcon className="h-3.5 w-3.5" />
                )
            }
        </CopyButton>
    );
}

export function InvoicesTab({ data }: { data: Data }) {
    const [category, setCategory] = useState("all");
    const rows = useMemo(
        () =>
            sortedInvoices(data.invoices).filter(
                (row) => category === "all" || row.category === category,
            ),
        [data.invoices, category],
    );

    return (
        <div className="flex flex-col gap-4">
            <DataNote
                pipe="invoices_ep"
                rows={rows.length}
                source="IV + HC"
                transform="Forager parser + operator corrections"
                purpose="verify invoice evidence before matching"
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
                            <TableHeaderCell>provider</TableHeaderCell>
                            <TableHeaderCell>category</TableHeaderCell>
                            <TableHeaderCell>kind</TableHeaderCell>
                            <TableHeaderCell>period_month</TableHeaderCell>
                            <TableHeaderCell>amount</TableHeaderCell>
                            <TableHeaderCell>currency</TableHeaderCell>
                            <TableHeaderCell>amount_usd</TableHeaderCell>
                            <TableHeaderCell>credit_usd</TableHeaderCell>
                            <TableHeaderCell>invoice_number</TableHeaderCell>
                            <TableHeaderCell>issued_at</TableHeaderCell>
                            <TableHeaderCell>source</TableHeaderCell>
                            <TableHeaderCell>file</TableHeaderCell>
                            <TableHeaderCell>status</TableHeaderCell>
                            <TableHeaderCell>ingested_at</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow
                                key={`${row.sha256}|${row.source}|${row.ingested_at}`}
                            >
                                <TableCell>{row.provider || "-"}</TableCell>
                                <TableCell>{row.category || "-"}</TableCell>
                                <TableCell>{row.kind || "-"}</TableCell>
                                <TableCell>{row.period_month || "-"}</TableCell>
                                <TableCell>{row.amount}</TableCell>
                                <TableCell>{row.currency || "-"}</TableCell>
                                <TableCell>{fmtUsd2(row.amount_usd)}</TableCell>
                                <TableCell>
                                    {row.credit_usd > 0
                                        ? fmtUsd2(row.credit_usd)
                                        : "-"}
                                </TableCell>
                                <TableCell>
                                    {row.invoice_number || "-"}
                                </TableCell>
                                <TableCell>{row.issued_at || "-"}</TableCell>
                                <TableCell>
                                    <SourceBadge source={row.source} />
                                </TableCell>
                                <TableCell title={row.file_ref}>
                                    <FileRefAction fileRef={row.file_ref} />
                                </TableCell>
                                <TableCell>
                                    <StatusChip status={row.status} />
                                </TableCell>
                                <TableCell>{row.ingested_at || "-"}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
