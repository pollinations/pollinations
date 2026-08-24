import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { Fragment, useMemo, useState } from "react";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { EvidenceAction, EvidencePreview } from "../components/Evidence";
import { SourceCell } from "../components/Provenance";
import { categoryLabel, transactionCategory } from "../lib/categories";
import type { DriveDocumentLink } from "../lib/documents";
import { fmtNumber, fmtUtcDateTime } from "../lib/format";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
    WINDOW_START,
} from "../lib/months";
import type { Data, OpTransactionRow } from "../types";

export function OpTransactionsTab({
    category = [],
    data,
    month = "",
    vendor = "all",
}: {
    category?: ValueFilter;
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const [previewDocument, setPreviewDocument] =
        useState<DriveDocumentLink | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const baseRows = useMemo(() => {
        return (data.opTransactions ?? []).filter(
            (row) =>
                row.date.slice(0, 7) >= WINDOW_START &&
                matchesMonth(row.date, month) &&
                matchesValue(row.vendor, vendor) &&
                matchesValue(transactionCategory(row), category),
        );
    }, [data.opTransactions, month, vendor, category]);
    const sortColumns = useMemo<SortColumn<OpTransactionRow>[]>(
        () => [
            { key: "date", value: (row) => row.date },
            { key: "vendor", value: (row) => row.vendor },
            { key: "category", value: transactionCategory },
            { key: "amount", value: (row) => row.amount },
            { key: "currency", value: (row) => row.currency },
            { key: "description", value: (row) => row.description },
            { key: "evidence", value: (row) => row.evidence },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "date",
        direction: "desc",
    });

    const toggle = (key: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell colSpan={3} align="center">
                            Transaction
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Cash
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Evidence
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2}>Details</TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell {...headerProps("date")}>
                            Date
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("vendor")}>
                            Vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("category")}>
                            Category
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("amount")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "Signed Wise value. Ordinary rows are cash movements; the opening-balance row is a non-movement anchor used only to reconstruct cash.",
                                    tables: "op_transactions_api",
                                    sources: "WISE",
                                }}
                            >
                                Amount
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            Currency
                        </TableHeaderCell>
                        <TableHeaderCell
                            className={GROUP_BORDER}
                            {...headerProps("description")}
                        >
                            Description
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("evidence")}>
                            <HeaderHint hint="Supporting document matched to this Wise cash movement. The transaction is the source of truth; Close reuses this same link when verifying vendor payments.">
                                Document
                            </HeaderHint>
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, (row) => row.entry_id).map(
                        ({ key, row }) => {
                            const isExpanded = expanded.has(key);
                            return (
                                <Fragment key={key}>
                                    <TableRow>
                                        <TableCell>{row.date}</TableCell>
                                        <TableCell>
                                            {row.vendor || (
                                                <Chip
                                                    intent="warning"
                                                    size="sm"
                                                >
                                                    unmatched
                                                </Chip>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {categoryLabel(
                                                transactionCategory(row),
                                            )}
                                        </TableCell>
                                        <TableCell
                                            align="right"
                                            className={GROUP_BORDER}
                                        >
                                            {fmtNumber(row.amount)}
                                        </TableCell>
                                        <TableCell>{row.currency}</TableCell>
                                        <TableCell className={GROUP_BORDER}>
                                            {row.description}
                                        </TableCell>
                                        <TableCell>
                                            <EvidenceAction
                                                evidence={row.evidence}
                                                onPreview={setPreviewDocument}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <button
                                                type="button"
                                                onClick={() => toggle(key)}
                                                className="font-medium text-theme-text underline underline-offset-4 hover:text-theme-text-soft"
                                                aria-expanded={isExpanded}
                                            >
                                                {isExpanded ? "Hide" : "Show"}
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                    {isExpanded ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={8}
                                                className="bg-theme-bg-active/40"
                                            >
                                                <dl className="grid gap-4 p-2 sm:grid-cols-3">
                                                    <div>
                                                        <dt className="text-xs font-medium uppercase tracking-wide text-theme-text-soft">
                                                            Source
                                                        </dt>
                                                        <dd className="mt-1">
                                                            <SourceCell
                                                                sources={[
                                                                    row.source,
                                                                ]}
                                                            />
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-xs font-medium uppercase tracking-wide text-theme-text-soft">
                                                            Recorded
                                                        </dt>
                                                        <dd className="font-mono text-sm text-theme-text-strong">
                                                            {fmtUtcDateTime(
                                                                row.recorded_at,
                                                            )}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-xs font-medium uppercase tracking-wide text-theme-text-soft">
                                                            Entry ID
                                                        </dt>
                                                        <dd className="break-all font-mono text-sm text-theme-text-strong">
                                                            {row.entry_id}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </Fragment>
                            );
                        },
                    )}
                </TableBody>
            </DataTable>
            <EvidencePreview
                documentLink={previewDocument}
                onClose={() => setPreviewDocument(null)}
            />
        </TableScroller>
    );
}
