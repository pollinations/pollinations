import {
    ExternalLinkIcon,
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
import {
    dirtyControlClass,
    editableControlClass,
} from "../components/EditableCell";
import { SourceCell } from "../components/Provenance";
import { fmtMoney } from "../lib/format";
import { matchesMonth } from "../lib/months";
import { queuedInvoiceKey } from "../lib/queued";
import { type StageInput, useStaging } from "../lib/staging";
import type { Data, InvoiceRow } from "../types";

export const INVOICE_CATEGORIES = [
    "compute",
    "infra",
    "saas",
    "admin",
    "office",
    "payroll",
    "other",
];

export type InvoiceEditValues = {
    category: string;
};

function nowDateTime() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function finiteNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function invoiceDate(value: string, periodMonth: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (/^\d{4}-\d{2}$/.test(periodMonth)) return `${periodMonth}-01`;
    return "1970-01-01";
}

export function initialInvoiceValues(row: InvoiceRow): InvoiceEditValues {
    return {
        category: row.category || "other",
    };
}

export function validateInvoiceEdit(values: InvoiceEditValues): string | null {
    if (!INVOICE_CATEGORIES.includes(values.category)) {
        return "category is not valid";
    }

    return null;
}

export function buildInvoiceManualChange({
    ingestedAt = nowDateTime(),
    row,
    values,
}: {
    ingestedAt?: string;
    row: InvoiceRow;
    values: InvoiceEditValues;
}): StageInput {
    return {
        datasource: "invoices",
        key: `invoices:${row.sha256}`,
        row: {
            sha256: row.sha256,
            provider: row.provider || "other",
            category: values.category,
            period_month: row.period_month || "",
            amount: finiteNumber(row.amount),
            currency: row.currency || "USD",
            invoice_number: row.invoice_number || "",
            issued_at: invoiceDate(row.issued_at, row.period_month),
            source: "manual",
            file_ref: row.file_ref || "",
            ingested_at: ingestedAt,
            credit_usd: finiteNumber(row.credit_usd),
        },
        summary: `invoice ${row.provider || "other"} ${row.period_month || "-"} category -> ${values.category}`,
    };
}

function sortedInvoices(rows: InvoiceRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.period_month.localeCompare(a.period_month) ||
            a.provider.localeCompare(b.provider) ||
            a.invoice_number.localeCompare(b.invoice_number) ||
            a.sha256.localeCompare(b.sha256),
    );
}

function stagedInvoiceShas(
    changes: { datasource: string; row: Record<string, unknown> }[],
) {
    const shas = new Set<string>();
    for (const change of changes) {
        if (change.datasource === "invoices") {
            const sha = change.row.sha256;
            if (typeof sha === "string") shas.add(sha);
        }
    }
    return shas;
}

function FileRefAction({ fileRef }: { fileRef: string }) {
    if (!fileRef) return <span>-</span>;

    return (
        <a
            href={`/api/files/invoice?path=${encodeURIComponent(fileRef)}`}
            target="_blank"
            rel="noreferrer"
            title={fileRef}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-theme-border/70 bg-theme-bg/60 px-2.5 text-sm font-medium text-theme-text-soft transition-colors hover:bg-theme-bg-hover hover:text-theme-text-strong"
        >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            Open
        </a>
    );
}

function InvoiceCategoryCell({ row }: { row: InvoiceRow }) {
    const { changes, stage, unstage } = useStaging();
    const stageKey = `invoices:${row.sha256}`;
    const staged = changes.find((change) => change.key === stageKey);
    const category = staged
        ? String(staged.row.category ?? "")
        : initialInvoiceValues(row).category;
    const dirty = category !== initialInvoiceValues(row).category;

    const update = (value: string) => {
        const next = { category: value };
        if (validateInvoiceEdit(next)) return;
        const unchanged = next.category === row.category;
        if (unchanged) {
            unstage(stageKey);
        } else {
            stage(buildInvoiceManualChange({ row, values: next }));
        }
    };

    return (
        <select
            value={category}
            onChange={(event) => update(event.target.value)}
            aria-label="category"
            className={dirtyControlClass(dirty, editableControlClass)}
        >
            {INVOICE_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                    {option}
                </option>
            ))}
        </select>
    );
}

export function InvoicesTab({
    category = "all",
    data,
    month = "",
    provider = "all",
    queuedKeys = new Set<string>(),
}: {
    category?: string;
    data: Data;
    month?: string;
    provider?: string;
    queuedKeys?: ReadonlySet<string>;
}) {
    const { changes } = useStaging();
    const stagedShas = useMemo(() => stagedInvoiceShas(changes), [changes]);

    const baseRows = useMemo(
        () =>
            sortedInvoices(data.invoices).filter((row) => {
                // undated invoices stay visible under any month filter
                if (!matchesMonth(row.period_month, month)) return false;
                if (provider !== "all" && row.provider !== provider) {
                    return false;
                }
                return category === "all" || row.category === category;
            }),
        [data.invoices, category, month, provider],
    );
    const sortColumns = useMemo<SortColumn<InvoiceRow>[]>(
        () => [
            { key: "provider", value: (row) => row.provider },
            { key: "category", value: (row) => row.category },
            { key: "period_month", value: (row) => row.period_month },
            { key: "source", value: (row) => row.source },
            { key: "amount", value: (row) => row.amount },
            { key: "credit_usd", value: (row) => row.credit_usd },
            { key: "invoice_number", value: (row) => row.invoice_number },
            { key: "issued_at", value: (row) => row.issued_at },
            { key: "file", value: (row) => row.file_ref },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns);

    return (
        <div className="flex flex-col gap-4">
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("provider")}>
                                provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("category")}>
                                category
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("period_month")}>
                                time period
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("source")}>
                                source
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("amount")}>
                                paid
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("credit_usd")}>
                                credits
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("invoice_number")}>
                                invoice_number
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("issued_at")}>
                                issued_at
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("file")}>
                                file
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(rows, (row) => row.sha256).map(
                            ({ key, row }) => {
                                const manualSource =
                                    stagedShas.has(row.sha256) ||
                                    queuedKeys.has(queuedInvoiceKey(row.sha256))
                                        ? "manual"
                                        : "";
                                return (
                                    <TableRow key={key}>
                                        <TableCell>
                                            {row.provider || "-"}
                                        </TableCell>
                                        <TableCell>
                                            <InvoiceCategoryCell row={row} />
                                        </TableCell>
                                        <TableCell>
                                            {row.period_month || "-"}
                                        </TableCell>
                                        <TableCell>
                                            <SourceCell
                                                sources={[
                                                    row.source,
                                                    manualSource,
                                                ]}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {fmtMoney(row.amount, row.currency)}
                                        </TableCell>
                                        <TableCell>
                                            {row.credit_usd > 0
                                                ? fmtMoney(
                                                      row.credit_usd,
                                                      row.currency,
                                                  )
                                                : "-"}
                                        </TableCell>
                                        <TableCell>
                                            {row.invoice_number || "-"}
                                        </TableCell>
                                        <TableCell>
                                            {row.issued_at || "-"}
                                        </TableCell>
                                        <TableCell title={row.file_ref}>
                                            <FileRefAction
                                                fileRef={row.file_ref}
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            },
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
