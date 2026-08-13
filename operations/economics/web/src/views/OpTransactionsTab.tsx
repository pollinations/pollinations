import {
    Button,
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import {
    type DriveDocumentLink,
    driveDocumentLink,
    externalEvidenceUrl,
} from "../lib/documents";
import { fmtNumber } from "../lib/format";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
} from "../lib/months";
import type { Data, OpTransactionRow } from "../types";

function DocumentPreview({
    documentLink,
    onClose,
}: {
    documentLink: DriveDocumentLink;
    onClose: () => void;
}) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
            if (event.key !== "Tab") return;

            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            if (!focusable || focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    if (!documentLink.previewHref) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <button
                type="button"
                className="absolute inset-0 bg-black/60"
                aria-label="Close document preview"
                tabIndex={-1}
                onClick={onClose}
            />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="document-preview-title"
                className="relative flex h-[min(90vh,64rem)] w-[min(94vw,72rem)] flex-col overflow-hidden rounded-2xl bg-surface-opaque shadow-2xl"
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-theme-text-strong/10 px-4 py-3">
                    <h2
                        id="document-preview-title"
                        className="font-semibold text-theme-text-strong"
                    >
                        Document preview
                    </h2>
                    <div className="flex items-center gap-2">
                        <Button
                            as="a"
                            href={documentLink.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            intent="info"
                            size="sm"
                        >
                            Open in Drive
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={onClose}
                            autoFocus
                        >
                            Close
                        </Button>
                    </div>
                </div>
                <iframe
                    src={documentLink.previewHref}
                    title="Google Drive document preview"
                    className="min-h-0 w-full flex-1 bg-white"
                    referrerPolicy="strict-origin-when-cross-origin"
                />
            </div>
        </div>,
        document.body,
    );
}

function TransactionDocument({
    evidence,
    onPreview,
}: {
    evidence: string;
    onPreview: (link: DriveDocumentLink) => void;
}) {
    const rawEvidence = evidence.trim();

    if (!rawEvidence) {
        return (
            <Chip intent="warning" size="sm">
                Missing
            </Chip>
        );
    }

    const link = driveDocumentLink(rawEvidence);
    if (link?.previewHref) {
        return (
            <button
                type="button"
                onClick={() => onPreview(link)}
                className="font-medium text-theme-text underline underline-offset-4 hover:text-theme-text-soft"
            >
                Preview
            </button>
        );
    }

    if (link) {
        return (
            <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-theme-text underline underline-offset-4 hover:text-theme-text-soft"
            >
                {link.label}
            </a>
        );
    }

    const externalHref = externalEvidenceUrl(rawEvidence);
    if (!externalHref) {
        return <span className="break-all">{rawEvidence}</span>;
    }

    return (
        <a
            href={externalHref}
            target="_blank"
            rel="noreferrer noopener"
            className="break-all font-medium text-theme-text underline underline-offset-4 hover:text-theme-text-soft"
        >
            {rawEvidence}
        </a>
    );
}

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
    const baseRows = useMemo(() => {
        return (data.opTransactions ?? []).filter(
            (row) =>
                matchesMonth(row.date, month) &&
                matchesValue(row.vendor, vendor) &&
                matchesValue(row.category, category),
        );
    }, [data.opTransactions, month, vendor, category]);
    const sortColumns = useMemo<SortColumn<OpTransactionRow>[]>(
        () => [
            { key: "date", value: (row) => row.date },
            { key: "vendor", value: (row) => row.vendor },
            { key: "category", value: (row) => row.category },
            { key: "amount", value: (row) => row.amount },
            { key: "currency", value: (row) => row.currency },
            { key: "description", value: (row) => row.description },
            {
                key: "evidence",
                value: (row) =>
                    driveDocumentLink(row.evidence)?.label ??
                    row.evidence.trim(),
            },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "date",
        direction: "desc",
    });

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
                                        "Signed Wise cash movement. Revenue/inflows are positive; spend/outflows are negative.",
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
                            Document
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, (row) => row.entry_id).map(
                        ({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{row.date}</TableCell>
                                <TableCell>
                                    {row.vendor || (
                                        <Chip intent="warning" size="sm">
                                            unmatched
                                        </Chip>
                                    )}
                                </TableCell>
                                <TableCell>{row.category}</TableCell>
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
                                    <TransactionDocument
                                        evidence={row.evidence}
                                        onPreview={setPreviewDocument}
                                    />
                                </TableCell>
                            </TableRow>
                        ),
                    )}
                </TableBody>
            </DataTable>
            {previewDocument?.previewHref && (
                <DocumentPreview
                    documentLink={previewDocument}
                    onClose={() => setPreviewDocument(null)}
                />
            )}
        </TableScroller>
    );
}
