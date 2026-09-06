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

const CLOSE_HINT: Record<ProviderCloseRow["closeStatus"], string> = {
    ready: "Vendor source and account coverage checks are complete for this vendor-month.",
    "missing document":
        "Transaction evidence is missing or still unresolved. This item blocks the monthly close.",
    "needs provider check":
        "The vendor statement, dashboard export, or other archived source is missing. No vendor cost is inferred.",
    "needs account check":
        "Vendor data exists, but the active account coverage is incomplete or the source is not assigned to a known account.",
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
                <Chip intent="neutral" size="sm">
                    open
                </Chip>
            </Tooltip>
        );
    }
    return (
        <Tooltip triggerAs="span" content={CLOSE_HINT[row.closeStatus]}>
            <Chip intent={CLOSE_INTENT[row.closeStatus]} size="sm">
                {CLOSE_LABEL[row.closeStatus]}
            </Chip>
        </Tooltip>
    );
}

function FundingValue({ row }: { row: ProviderCloseRow }) {
    const hint =
        row.fundingStatus === "needs check"
            ? "Unknown until the vendor statement is checked."
            : row.fundingStatus === "unknown"
              ? "The historical vendor funding could not be reconstructed; the gap is documented."
              : row.fundingStatus === "not applicable"
                ? "Internal usage has no external vendor bill."
                : row.fundingStatus === "credit/free"
                  ? "The checked vendor statement creates no cash payable amount."
                  : row.fundingStatus === "mixed"
                    ? "This month contains both vendor-billed and credit-funded usage."
                    : "The checked vendor statement contains a cash payable amount.";
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
                                <TableHeaderCell>
                                    <HeaderHint hint="One vendor-source and account-coverage status. Transaction documents are checked in the month-level result; tax filing confirmation remains separate.">
                                        Status
                                    </HeaderHint>
                                </TableHeaderCell>
                                <TableHeaderCell>Vendor</TableHeaderCell>
                                <TableHeaderCell>
                                    <HeaderHint hint="How the archived vendor source says this vendor-month was funded. Unknown means the historical gap is documented but not reconstructed.">
                                        Funding
                                    </HeaderHint>
                                </TableHeaderCell>
                                <TableHeaderCell align="right">
                                    <HeaderHint hint="Vendor cost recorded by the archived source as cash-funded. This is usage cost, not an invoice-to-payment match.">
                                        Cash-funded
                                    </HeaderHint>
                                </TableHeaderCell>
                                <TableHeaderCell align="right">
                                    <HeaderHint hint="Vendor usage covered by credits or explicitly verified as free. This is not a cash cost.">
                                        Credit / free
                                    </HeaderHint>
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
