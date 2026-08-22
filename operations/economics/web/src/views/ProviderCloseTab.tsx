import {
    Button,
    Dialog,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import {
    DataTable,
    HeaderHint,
    TableScroller,
    withUniqueRowKeys,
} from "../components/DataTable";
import { EvidenceAction, EvidencePreview } from "../components/Evidence";
import { MonthlyLedgerAuditPanel } from "../components/MonthlyLedgerAuditPanel";
import { StatCards, type StatItem } from "../components/StatCards";
import type { DriveDocumentLink } from "../lib/documents";
import { fmtUsd } from "../lib/format";
import { monthlyLedgerAuditRows } from "../lib/ledgerAudit";
import { type MonthFilterValue, monthLabel } from "../lib/months";
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

const CLOSE_CLASS: Record<ProviderCloseRow["closeStatus"], string> = {
    ready: "bg-intent-success-bg-bright/15 text-intent-success-text ring-intent-success-bg-bright/30",
    "needs provider check":
        "bg-intent-danger-bg-light text-intent-danger-text ring-intent-danger-border/40",
    "needs account check":
        "bg-intent-warning-bg-light text-intent-warning-text ring-intent-warning-text/25",
};

const CLOSE_LABEL: Record<ProviderCloseRow["closeStatus"], string> = {
    ready: "ready",
    "needs provider check": "missing source",
    "needs account check": "account incomplete",
};

const CLOSE_HINT: Record<ProviderCloseRow["closeStatus"], string> = {
    ready: "Provider source and account coverage checks are complete for this provider-month.",
    "needs provider check":
        "The provider statement, dashboard export, or other archived source is missing. No provider cost is inferred.",
    "needs account check":
        "Provider data exists, but the active account coverage is incomplete or the source is not assigned to a known account.",
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
            <Tooltip
                triggerAs="span"
                content="The current month is open and excluded from close-readiness counts."
            >
                <span className="inline-flex whitespace-nowrap rounded-md bg-theme-bg-active px-2 py-0.5 text-xs font-medium text-theme-text-soft ring-1 ring-theme-border">
                    open
                </span>
            </Tooltip>
        );
    }
    return (
        <Tooltip triggerAs="span" content={CLOSE_HINT[row.closeStatus]}>
            <span
                className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${CLOSE_CLASS[row.closeStatus]}`}
            >
                {CLOSE_LABEL[row.closeStatus]}
            </span>
        </Tooltip>
    );
}

function FundingValue({ row }: { row: ProviderCloseRow }) {
    const hint =
        row.fundingStatus === "needs check"
            ? "Unknown until the provider statement is checked."
            : row.fundingStatus === "unknown"
              ? "The historical provider funding could not be reconstructed; the gap is documented."
              : row.fundingStatus === "not applicable"
                ? "Internal usage has no external provider bill."
                : row.fundingStatus === "credit/free"
                  ? "The checked provider statement creates no cash payable amount."
                  : row.fundingStatus === "mixed"
                    ? "This month contains both provider-billed and credit-funded usage."
                    : "The checked provider statement contains a cash payable amount.";
    return (
        <Tooltip triggerAs="span" content={hint}>
            <span className="whitespace-nowrap text-sm text-theme-text-soft">
                {FUNDING_LABEL[row.fundingStatus]}
            </span>
        </Tooltip>
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
        <button
            type="button"
            onClick={onBrowse}
            className="whitespace-nowrap text-xs font-medium text-theme-text underline underline-offset-4 hover:text-theme-text-soft"
        >
            Provider source ({items.length})
        </button>
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
            title={`Provider source · ${selection.vendor} · ${monthLabel(selection.month)}`}
            size="md"
        >
            <div className="flex max-h-[70vh] flex-col px-6 pb-6 pt-3">
                <p className="pb-3 text-sm text-theme-text-soft">
                    Statements, invoices, dashboard exports, or usage records
                    collected from the provider.
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
                                    previewLabel="Provider source"
                                    openDocumentLabel="Provider source"
                                    onPreview={(documentLink) =>
                                        onPreview(
                                            documentLink,
                                            "Provider source",
                                        )
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
}: {
    data: Data;
    month?: MonthFilterValue;
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
    const transactionEvidenceGaps = closedAuditRows.reduce(
        (total, row) => total + row.transactionEvidenceGaps,
        0,
    );
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
        transactionEvidenceGaps +
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
            ? `${summary.blockers} provider ${summary.blockers === 1 ? "check" : "checks"}`
            : null,
        transactionEvidenceGaps
            ? `${transactionEvidenceGaps} transaction ${transactionEvidenceGaps === 1 ? "document" : "documents"} missing`
            : null,
        missingMappings
            ? `${missingMappings} provider ${missingMappings === 1 ? "mapping" : "mappings"} missing`
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
                        ? "no provider-months selected"
                        : periodStatus === "open"
                          ? "current month is still open"
                          : periodStatus === "action needed"
                            ? actionDetail
                            : `${summary.closeReady} provider-months ready · filing confirmation not tracked`,
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
                detail: "from archived provider sources",
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
                <h3 className="text-lg font-semibold text-theme-text-strong">
                    Ledger integrity
                </h3>
                <MonthlyLedgerAuditPanel data={data} month="" />
            </section>
            <section className="flex flex-col gap-4">
                <h3 className="text-lg font-semibold text-theme-text-strong">
                    Monthly close
                </h3>
                <StatCards items={statusStats} />
                <TableScroller>
                    <DataTable className="min-w-[900px]">
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>
                                    <HeaderHint hint="One provider-source and account-coverage status. Transaction documents are checked in the month-level result; tax filing confirmation remains separate.">
                                        Status
                                    </HeaderHint>
                                </TableHeaderCell>
                                <TableHeaderCell>Month</TableHeaderCell>
                                <TableHeaderCell>Provider</TableHeaderCell>
                                <TableHeaderCell>
                                    <HeaderHint hint="How the archived provider source says this provider-month was funded. Unknown means the historical gap is documented but not reconstructed.">
                                        Funding
                                    </HeaderHint>
                                </TableHeaderCell>
                                <TableHeaderCell align="right">
                                    <HeaderHint hint="Provider cost recorded by the archived source as cash-funded. This is usage cost, not an invoice-to-payment match.">
                                        Cash-funded
                                    </HeaderHint>
                                </TableHeaderCell>
                                <TableHeaderCell align="right">
                                    <HeaderHint hint="Provider usage covered by credits or explicitly verified as free. This is not a cash cost.">
                                        Credit / free
                                    </HeaderHint>
                                </TableHeaderCell>
                                <TableHeaderCell>
                                    Provider source
                                </TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {withUniqueRowKeys(
                                rows,
                                (row) => `${row.month}|${row.vendor}`,
                            ).map(({ key, row }) => {
                                return (
                                    <TableRow key={key}>
                                        <TableCell>
                                            <StatusBadge row={row} />
                                        </TableCell>
                                        <TableCell>
                                            {monthLabel(row.month)}
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
                                                {row.evidence.length ? (
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
                                                ) : row.closeStatus ===
                                                  "ready" ? (
                                                    <span className="text-sm text-theme-text-soft">
                                                        Not required
                                                    </span>
                                                ) : (
                                                    <span className="text-sm text-theme-text-soft">
                                                        —
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
