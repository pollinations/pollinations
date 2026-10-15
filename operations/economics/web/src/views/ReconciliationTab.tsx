import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useState } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
} from "../components/DataTable";
import { EvidenceAction, EvidencePreview } from "../components/Evidence";
import type { DriveDocumentLink } from "../lib/documents";
import { fmtUsd } from "../lib/format";
import { monthName } from "../lib/months";
import {
    RECONCILIATION_PAGES,
    RECONCILIATION_TYPES,
    type ReconciliationIssue,
    type ReconciliationPage,
    type ReconciliationType,
} from "../lib/reconciliation";

const SORT_COLUMNS: SortColumn<ReconciliationIssue>[] = [
    { key: "vendor", value: (row) => row.vendor },
    { key: "month", value: (row) => row.month },
    { key: "messages", value: (row) => row.messages.join(" ") },
    { key: "amount", value: (row) => row.amountUsd },
    {
        key: "affects",
        value: (row) =>
            row.affects.map((page) => RECONCILIATION_PAGES[page]).join(", "),
    },
];

export function ReconciliationTab({
    issues,
    year,
    onOpen,
    initialPage = null,
    pending = [],
}: {
    issues: ReconciliationIssue[];
    pending?: string[];
    year: string;
    initialPage?: ReconciliationPage | null;
    onOpen: (page: ReconciliationPage, month: string) => void;
}) {
    const [previewDocument, setPreviewDocument] =
        useState<DriveDocumentLink | null>(null);
    const [page, setPage] = useState<ReconciliationPage | "">(
        initialPage ?? "",
    );
    const [type, setType] = useState<ReconciliationType | "">("");
    const scoped = issues.filter(
        (row) =>
            row.month.startsWith(`${year}-`) &&
            (!page || row.affects.includes(page)),
    );
    const billingNotices = pending.filter(
        (notice) => notice.includes(`${year}-`) && (!page || page === "runway"),
    );
    const visible = scoped.filter((row) => !type || row.types.includes(type));
    const { rows, headerProps } = useSortableRows(visible, SORT_COLUMNS);
    // One row per provider/month, even when it has several issue types.
    const types = Object.keys(RECONCILIATION_TYPES) as ReconciliationType[];
    const groups = types
        .map((key) => ({
            key,
            rows: rows.filter(
                (row) =>
                    (type ||
                        types.find((candidate) =>
                            row.types.includes(candidate),
                        )) === key,
            ),
        }))
        .filter((group) => group.rows.length > 0);
    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
                <select
                    aria-label="Affected page"
                    value={page}
                    onChange={(event) =>
                        setPage(event.target.value as ReconciliationPage | "")
                    }
                    className="rounded border border-theme-border bg-surface-opaque px-2 py-1 text-sm"
                >
                    <option value="">All pages</option>
                    {Object.entries(RECONCILIATION_PAGES).map(
                        ([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ),
                    )}
                </select>
                <select
                    aria-label="Issue type"
                    value={type}
                    onChange={(event) =>
                        setType(event.target.value as ReconciliationType | "")
                    }
                    className="rounded border border-theme-border bg-surface-opaque px-2 py-1 text-sm"
                >
                    <option value="">All issue types</option>
                    {types.map((key) => (
                        <option key={key} value={key}>
                            {RECONCILIATION_TYPES[key]} ·{" "}
                            {
                                scoped.filter((row) => row.types.includes(key))
                                    .length
                            }
                        </option>
                    ))}
                </select>
                <span className="text-sm text-theme-text-soft">
                    {visible.length} items · {year}
                </span>
            </div>
            {visible.length === 0 && (
                <p>No outstanding checks recorded for this selection.</p>
            )}
            {visible.length > 0 && (
                <TableScroller>
                    <DataTable className="[&_td]:align-top [&_td]:whitespace-normal">
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell {...headerProps("vendor")}>
                                    Provider
                                </TableHeaderCell>
                                <TableHeaderCell {...headerProps("messages")}>
                                    To reconcile
                                </TableHeaderCell>
                                <TableHeaderCell {...headerProps("month")}>
                                    Month
                                </TableHeaderCell>
                                <TableHeaderCell
                                    {...headerProps("amount")}
                                    align="right"
                                >
                                    Related amount
                                </TableHeaderCell>
                                <TableHeaderCell {...headerProps("affects")}>
                                    Affects
                                </TableHeaderCell>
                                <TableHeaderCell>Invoices</TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        {groups.map((group) => (
                            <TableBody key={group.key}>
                                <TableRow>
                                    <TableHeaderCell
                                        colSpan={6}
                                        scope="rowgroup"
                                        className="bg-surface-opaque"
                                    >
                                        {RECONCILIATION_TYPES[group.key]} ·{" "}
                                        {group.rows.length}
                                    </TableHeaderCell>
                                </TableRow>
                                {group.rows.map((issue) => (
                                    <TableRow key={issue.id}>
                                        <TableCell className="font-semibold">
                                            {issue.vendor}
                                        </TableCell>
                                        <TableCell className="min-w-64 max-w-xl">
                                            {issue.types
                                                .filter(
                                                    (key) => key !== group.key,
                                                )
                                                .map((key) => (
                                                    <span
                                                        key={key}
                                                        className="mr-2 text-xs text-theme-text-soft"
                                                    >
                                                        {
                                                            RECONCILIATION_TYPES[
                                                                key
                                                            ]
                                                        }
                                                    </span>
                                                ))}
                                            {issue.messages.map((message) => (
                                                <p key={message}>{message}</p>
                                            ))}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {monthName(issue.month)}
                                        </TableCell>
                                        <TableCell
                                            align="right"
                                            className="min-w-36 max-w-48"
                                        >
                                            {issue.amountUsd != null && (
                                                <>
                                                    {fmtUsd(issue.amountUsd)}
                                                    <span className="block text-xs text-theme-text-soft">
                                                        {issue.amountLabel}
                                                    </span>
                                                </>
                                            )}
                                        </TableCell>
                                        <TableCell className="min-w-40 max-w-60">
                                            <div className="flex flex-wrap gap-x-2 gap-y-1">
                                                {issue.affects.map((page) => (
                                                    <button
                                                        key={page}
                                                        type="button"
                                                        className="text-xs underline underline-offset-2"
                                                        onClick={() =>
                                                            onOpen(
                                                                page,
                                                                issue.month,
                                                            )
                                                        }
                                                    >
                                                        {
                                                            RECONCILIATION_PAGES[
                                                                page
                                                            ]
                                                        }
                                                    </button>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col items-start gap-1">
                                                {(issue.invoices ?? []).map(
                                                    (evidence, i) => (
                                                        <EvidenceAction
                                                            key={evidence}
                                                            evidence={evidence}
                                                            onPreview={
                                                                setPreviewDocument
                                                            }
                                                            previewLabel={`Preview invoice ${i + 1} for ${issue.vendor}`}
                                                            openDocumentLabel={`invoice ${i + 1} for ${issue.vendor}`}
                                                        />
                                                    ),
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        ))}
                    </DataTable>
                </TableScroller>
            )}
            <EvidencePreview
                documentLink={previewDocument}
                onClose={() => setPreviewDocument(null)}
            />
            {billingNotices.length > 0 && (
                <details className="text-sm text-theme-text-soft">
                    <summary className="cursor-pointer">
                        Expected billing · {billingNotices.length} pending
                        estimates
                    </summary>
                    <p className="mt-2">
                        Already included in the cash forecast; awaiting supplier
                        invoices.
                    </p>
                    <ul className="mt-2 list-disc space-y-2 pl-5">
                        {billingNotices.map((notice) => (
                            <li key={notice}>{notice}</li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}
