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
import { dirtyControlClass } from "../components/EditableCell";
import { fmtPeriod, utcDateTime } from "../lib/format";
import { matchesMonth } from "../lib/months";
import { PROVIDER_OPTIONS } from "../lib/provider-vocabulary";
import { type StageInput, useStaging } from "../lib/staging";
import type { Data, TransactionRow } from "../types";

const TRANSACTION_CATEGORIES = [
    "compute",
    "infra",
    "saas",
    "admin",
    "office",
    "payroll",
    "other",
];

function transactionKey(row: TransactionRow) {
    return [
        row.date,
        row.provider,
        row.category,
        row.bank_charged,
        row.cash_paid,
        row.credit_burned,
        row.invoice_ref,
        row.match_status,
    ].join("|");
}

function transactionIdentity(row: TransactionRow) {
    return [
        row.date,
        row.bank_charged,
        row.cash_paid,
        row.credit_burned,
        row.invoice_ref,
        row.match_status,
    ].join("|");
}

function buildTransactionOverrideChange({
    enteredAt = utcDateTime(),
    field,
    row,
    value,
}: {
    enteredAt?: string;
    field: "category" | "provider";
    row: TransactionRow;
    value: string;
}): StageInput {
    const key = transactionIdentity(row);
    return {
        datasource: "overrides",
        key: `transactions:${key}:${field}`,
        row: {
            entered_at: enteredAt,
            scope: "transactions",
            key,
            field,
            value_num: null,
            value_str: value,
            note: "",
        },
        summary: `transaction ${row.date} ${row.invoice_ref || row.bank_charged || "-"} ${field} -> ${value}`,
    };
}

function InvoiceRef({ value }: { value: string }) {
    if (!value) return <span>-</span>;

    return (
        <a
            href={`/api/files/invoice?path=${encodeURIComponent(value)}`}
            target="_blank"
            rel="noreferrer"
            title={value}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-theme-border/70 bg-theme-bg/60 px-2.5 text-sm font-medium text-theme-text-soft transition-colors hover:bg-theme-bg-hover hover:text-theme-text-strong"
        >
            invoice
            <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
    );
}

function TransactionSelectCell({
    field,
    options,
    row,
}: {
    field: "category" | "provider";
    options: string[];
    row: TransactionRow;
}) {
    const { changes, committed, stage, unstage } = useStaging();
    const stageKey = `transactions:${transactionIdentity(row)}:${field}`;
    const overlay =
        changes.find((change) => change.key === stageKey) ??
        committed.find((change) => change.key === stageKey);
    const initial = row[field] || "other";
    const value = overlay ? String(overlay.row.value_str ?? "") : initial;
    const dirty = value !== initial;

    const update = (next: string) => {
        if (!options.includes(next)) return;
        if (next === initial) {
            unstage(stageKey);
        } else {
            stage(buildTransactionOverrideChange({ field, row, value: next }));
        }
    };

    return (
        <select
            value={value}
            onChange={(event) => update(event.target.value)}
            aria-label={field}
            className={dirtyControlClass(
                dirty,
                "rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong",
            )}
        >
            {options.map((option) => (
                <option key={option} value={option}>
                    {option}
                </option>
            ))}
        </select>
    );
}

export function TransactionsTab({
    category = "all",
    data,
    month = "",
    provider = "all",
}: {
    category?: string;
    data: Data;
    month?: string;
    provider?: string;
}) {
    const baseRows = useMemo(
        () =>
            data.transactions.filter(
                (row) =>
                    matchesMonth(row.date, month) &&
                    (provider === "all" || row.provider === provider) &&
                    (category === "all" || row.category === category),
            ),
        [data.transactions, month, provider, category],
    );
    const sortColumns = useMemo<SortColumn<TransactionRow>[]>(
        () => [
            { key: "date", value: (row) => row.date },
            { key: "provider", value: (row) => row.provider },
            { key: "category", value: (row) => row.category },
            { key: "bank_charged", value: (row) => row.bank_charged },
            { key: "cash_paid", value: (row) => row.cash_paid },
            { key: "credit_burned", value: (row) => row.credit_burned },
            { key: "match_status", value: (row) => row.match_status },
            { key: "invoice_ref", value: (row) => row.invoice_ref },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns);
    const providerOptions = useMemo(
        () => PROVIDER_OPTIONS.filter((option) => option !== "all"),
        [],
    );

    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("date")}>
                            time period
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("provider")}>
                            provider
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("category")}>
                            category
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("bank_charged")}>
                            bank charged
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("cash_paid")}>
                            cash paid
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("credit_burned")}>
                            credit burned
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("match_status")}>
                            match
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("invoice_ref")}>
                            invoice
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, transactionKey).map(
                        ({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{fmtPeriod(row.date)}</TableCell>
                                <TableCell>
                                    <TransactionSelectCell
                                        field="provider"
                                        options={providerOptions}
                                        row={row}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TransactionSelectCell
                                        field="category"
                                        options={TRANSACTION_CATEGORIES}
                                        row={row}
                                    />
                                </TableCell>
                                <TableCell>{row.bank_charged || "-"}</TableCell>
                                <TableCell>{row.cash_paid || "-"}</TableCell>
                                <TableCell>
                                    {row.credit_burned || "-"}
                                </TableCell>
                                <TableCell>{row.match_status || "-"}</TableCell>
                                <TableCell>
                                    <InvoiceRef value={row.invoice_ref} />
                                </TableCell>
                            </TableRow>
                        ),
                    )}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}
