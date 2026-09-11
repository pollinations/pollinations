import {
    Button,
    Chip,
    Dialog,
    Heading,
    InlineLink,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import {
    DataTable,
    TableScroller,
    withUniqueRowKeys,
} from "../components/DataTable";
import { EvidenceAction, EvidencePreview } from "../components/Evidence";
import { MonthFilter } from "../components/Filters";
import { MonthlyLedgerAuditPanel } from "../components/MonthlyLedgerAuditPanel";
import { StatCards, type StatItem } from "../components/StatCards";
import type { DriveDocumentLink } from "../lib/documents";
import { fmtUsd } from "../lib/format";
import { monthlyLedgerAuditRows } from "../lib/ledgerAudit";
import { monthName } from "../lib/months";
import {
    attentionFirst,
    type ProviderCloseEvidence,
    type ProviderCloseRow,
    providerClosePeriodStatus,
    providerCloseRows,
    providerCloseSummary,
    visibleProviderCloseRows,
} from "../lib/providerClose";
import type { Data } from "../types";

const CLOSE_INTENT: Record<
    ProviderCloseRow["closeStatus"],
    "danger" | "success" | "warning"
> = {
    ready: "success",
    "missing document": "warning",
    "needs provider check": "danger",
    "needs account check": "warning",
};

const CLOSE_LABEL: Record<ProviderCloseRow["closeStatus"], string> = {
    ready: "ready",
    "missing document": "missing evidence",
    "needs provider check": "missing source",
    "needs account check": "account incomplete",
};

const FUNDING_LABEL: Record<ProviderCloseRow["fundingStatus"], string> = {
    billed: "Cash",
    "credit/free": "Credit / free",
    mixed: "Cash + credit",
    "not applicable": "Not applicable",
    unknown: "Unknown",
    "needs check": "—",
};

type EvidenceSelection = {
    vendor: string;
    month: string;
    items: ProviderCloseEvidence[];
};

type PreviewSelection = {
    documentLink: DriveDocumentLink;
    title: string;
};

function StatusBadge({ row }: { row: ProviderCloseRow }) {
    if (row.partial) {
        return (
            <Chip intent="neutral" size="sm">
                open
            </Chip>
        );
    }
    return (
        <Chip intent={CLOSE_INTENT[row.closeStatus]} size="sm">
            {CLOSE_LABEL[row.closeStatus]}
        </Chip>
    );
}

function FundingValue({ row }: { row: ProviderCloseRow }) {
    return (
        <span className="whitespace-nowrap text-sm text-theme-text-soft">
            {FUNDING_LABEL[row.fundingStatus]}
        </span>
    );
}

function EvidenceGroupAction({
    items,
    onBrowse,
}: {
    items: ProviderCloseEvidence[];
    onBrowse: () => void;
}) {
    if (!items.length) return null;
    return (
        <InlineLink
            as="button"
            type="button"
            onClick={onBrowse}
            external={false}
            showIcon={false}
            className="whitespace-nowrap text-xs"
        >
            Vendor source ({items.length})
        </InlineLink>
    );
}

function EvidenceListDialog({
    selection,
    onClose,
    onPreview,
}: {
    selection: EvidenceSelection | null;
    onClose: () => void;
    onPreview: (documentLink: DriveDocumentLink, title: string) => void;
}) {
    if (!selection) return null;

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            title={`Vendor source · ${selection.vendor} · ${monthName(selection.month)}`}
            size="md"
        >
            <div className="flex max-h-[70vh] flex-col px-6 pb-6 pt-3">
                <p className="pb-3 text-sm text-theme-text-soft">
                    Statements, invoices, dashboard exports, or usage records
                    collected from the vendor.
                </p>
                <ol className="min-h-0 divide-y divide-theme-border/60 overflow-y-auto rounded-lg border border-theme-border/60">
                    {selection.items.map((item, index) => (
                        <li
                            key={item.evidence}
                            className="flex items-center justify-between gap-4 px-3 py-2.5"
                        >
                            <div className="min-w-0">
                                <div className="font-medium text-theme-text-strong">
                                    Source {index + 1}
                                </div>
                                <div className="truncate text-xs text-theme-text-soft">
                                    {item.date} · {item.source}
                                </div>
                            </div>
                            <div className="shrink-0 text-sm">
                                <EvidenceAction
                                    evidence={item.evidence}
                                    previewLabel="Vendor source"
                                    openDocumentLabel="Vendor source"
                                    onPreview={(documentLink) =>
                                        onPreview(documentLink, "Vendor source")
                                    }
                                />
                            </div>
                        </li>
                    ))}
                </ol>
                <div className="flex justify-end pt-4">
                    <Button type="button" size="sm" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}

export function ProviderCloseTab({
    data,
    month = "",
    months,
    onMonthChange,
    year,
}: {
    data: Data;
    month?: string;
    months: string[];
    onMonthChange: (value: string) => void;
    year: string;
}) {
    const [evidenceSelection, setEvidenceSelection] =
        useState<EvidenceSelection | null>(null);
    const [previewSelection, setPreviewSelection] =
        useState<PreviewSelection | null>(null);
    const allRows = useMemo(() => providerCloseRows(data), [data]);
    const periodRows = useMemo(
        () =>
            visibleProviderCloseRows({
                rows: allRows,
                month,
                vendor: "all",
            }),
        [allRows, month],
    );
    const rows = useMemo(() => attentionFirst(periodRows), [periodRows]);
    const summary = useMemo(
        () => providerCloseSummary(periodRows),
        [periodRows],
    );
    const auditRows = useMemo(
        () => monthlyLedgerAuditRows(data, month),
        [data, month],
    );
    const closedAuditRows = auditRows.filter((row) => !row.partial);
    const openDocumentGaps = closedAuditRows.reduce(
        (total, row) => total + row.actionableTransactionEvidenceGaps,
        0,
    );
    const missingBankMonths = closedAuditRows.filter(
        (row) => row.missingBankData,
    ).length;
    const missingMappings = closedAuditRows.reduce(
        (total, row) => total + row.missingMappings,
        0,
    );
    const invalidRows = closedAuditRows.reduce(
        (total, row) => total + row.invalidRows,
        0,
    );
    const duplicateRows = closedAuditRows.reduce(
        (total, row) => total + row.duplicateRows,
        0,
    );
    const estimatedFxMonths = closedAuditRows.filter(
        (row) => row.estimatedFx,
    ).length;
    const ledgerIssues =
        openDocumentGaps +
        missingBankMonths +
        missingMappings +
        invalidRows +
        duplicateRows +
        estimatedFxMonths;
    const providerPeriodStatus = providerClosePeriodStatus(summary);
    const periodStatus =
        summary.blockers > 0 || ledgerIssues > 0
            ? "action needed"
            : summary.closedRows > 0 || closedAuditRows.length > 0
              ? "ready"
              : providerPeriodStatus;
    const actionDetail = [
        summary.blockers
            ? `${summary.blockers} vendor ${summary.blockers === 1 ? "check" : "checks"}`
            : null,
        openDocumentGaps
            ? `${openDocumentGaps} missing evidence ${openDocumentGaps === 1 ? "item" : "items"}`
            : null,
        missingBankMonths
            ? `${missingBankMonths} ${missingBankMonths === 1 ? "month has" : "months have"} no bank data`
            : null,
        missingMappings
            ? `${missingMappings} vendor ${missingMappings === 1 ? "mapping" : "mappings"} missing`
            : null,
        invalidRows
            ? `${invalidRows} invalid ${invalidRows === 1 ? "row" : "rows"}`
            : null,
        duplicateRows
            ? `${duplicateRows} duplicate ${duplicateRows === 1 ? "row" : "rows"}`
            : null,
        estimatedFxMonths
            ? `${estimatedFxMonths} estimated FX ${estimatedFxMonths === 1 ? "month" : "months"}`
            : null,
    ]
        .filter(Boolean)
        .join(" · ");
    const statusStats = useMemo<StatItem[]>(
        () => [
            {
                label: "Status",
                value:
                    periodStatus === "no data"
                        ? "No data"
                        : periodStatus === "open"
                          ? "Open"
                          : periodStatus === "action needed"
                            ? "Action needed"
                            : "Ready",
                detail:
                    periodStatus === "no data"
                        ? "no vendor-months selected"
                        : periodStatus === "open"
                          ? "current month is still open"
                          : periodStatus === "action needed"
                            ? actionDetail
                            : `${summary.closeReady} vendor-months ready · filing confirmation not tracked`,
                tone:
                    periodStatus === "action needed"
                        ? "warn"
                        : periodStatus === "ready"
                          ? "success"
                          : "base",
            },
            {
                label: "Cash-funded usage",
                value: fmtUsd(summary.billedUsd),
                detail: "from archived vendor sources",
            },
            {
                label: "Credit / free usage",
                value: fmtUsd(summary.creditFreeUsd),
                detail: "not a cash cost",
            },
        ],
        [actionDetail, periodStatus, summary],
    );

    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
                <Heading as="h3" size="card">
                    Ledger integrity
                </Heading>
                <MonthlyLedgerAuditPanel data={data} month="" />
            </section>
            <section className="flex flex-col gap-4">
                <Heading as="h3" size="card">
                    Monthly close
                </Heading>
                <MonthFilter
                    months={months}
                    year={year}
                    value={month}
                    onChange={onMonthChange}
                />
                <StatCards items={statusStats} />
                <TableScroller>
                    <DataTable className="min-w-[900px]">
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>Status</TableHeaderCell>
                                <TableHeaderCell>Vendor</TableHeaderCell>
                                <TableHeaderCell>Funding</TableHeaderCell>
                                <TableHeaderCell align="right">
                                    Cash-funded
                                </TableHeaderCell>
                                <TableHeaderCell align="right">
                                    Credit / free
                                </TableHeaderCell>
                                <TableHeaderCell>Evidence</TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {withUniqueRowKeys(
                                rows,
                                (row) => `${row.month}|${row.vendor}`,
                            ).map(({ key, row }) => {
                                const fallbackEvidenceLabel =
                                    row.closeStatus === "ready" &&
                                    row.fundingStatus === "unknown"
                                        ? "Documented gap"
                                        : row.closeStatus === "ready"
                                          ? "Not required"
                                          : "—";
                                return (
                                    <TableRow key={key}>
                                        <TableCell>
                                            <StatusBadge row={row} />
                                        </TableCell>
                                        <TableCell className="font-semibold">
                                            {row.vendor}
                                        </TableCell>
                                        <TableCell>
                                            <FundingValue row={row} />
                                        </TableCell>
                                        <TableCell align="right" numeric>
                                            {fmtUsd(row.billedUsd)}
                                        </TableCell>
                                        <TableCell align="right" numeric>
                                            {fmtUsd(row.creditFreeUsd)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex min-w-40 flex-col items-start gap-1.5">
                                                {row.evidence.length > 0 && (
                                                    <EvidenceGroupAction
                                                        items={row.evidence}
                                                        onBrowse={() =>
                                                            setEvidenceSelection(
                                                                {
                                                                    vendor: row.vendor,
                                                                    month: row.month,
                                                                    items: row.evidence,
                                                                },
                                                            )
                                                        }
                                                    />
                                                )}
                                                {row.transactionDocumentStatus !=
                                                    null && (
                                                    <span
                                                        className={
                                                            row.transactionDocumentStatus ===
                                                            "missing"
                                                                ? "text-sm text-intent-warning-text"
                                                                : "text-sm text-theme-text-soft"
                                                        }
                                                    >
                                                        {row.transactionDocumentStatus ===
                                                        "missing"
                                                            ? "Missing evidence"
                                                            : "Evidence exception"}
                                                    </span>
                                                )}
                                                {row.evidence.length === 0 &&
                                                    row.transactionDocumentStatus ==
                                                        null && (
                                                        <span className="text-sm text-theme-text-soft">
                                                            {
                                                                fallbackEvidenceLabel
                                                            }
                                                        </span>
                                                    )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </DataTable>
                </TableScroller>
            </section>
            <EvidenceListDialog
                selection={evidenceSelection}
                onClose={() => setEvidenceSelection(null)}
                onPreview={(documentLink, title) => {
                    setEvidenceSelection(null);
                    setPreviewSelection({ documentLink, title });
                }}
            />
            <EvidencePreview
                documentLink={previewSelection?.documentLink ?? null}
                title={previewSelection?.title}
                onClose={() => setPreviewSelection(null)}
            />
        </div>
    );
}
