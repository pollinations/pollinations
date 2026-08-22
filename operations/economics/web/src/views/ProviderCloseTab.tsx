import {
    Chip,
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
import { StatCards, type StatItem } from "../components/StatCards";
import { driveDocumentLink } from "../lib/documents";
import { fmtUsd } from "../lib/format";
import {
    type MonthFilterValue,
    monthLabel,
    type ValueFilter,
} from "../lib/months";
import {
    attentionFirst,
    type ProviderCloseEvidence,
    type ProviderCloseModelRow,
    type ProviderCloseRow,
    providerCloseRows,
    providerCloseSummary,
    visibleProviderCloseRows,
} from "../lib/providerClose";
import type { Data } from "../types";

const STATUS_CLASS: Record<ProviderCloseRow["closeStatus"], string> = {
    ready: "bg-intent-success-bg-bright/15 text-intent-success-text ring-intent-success-bg-bright/30",
    "needs provider check":
        "bg-intent-danger-bg-light text-intent-danger-text ring-intent-danger-border/40",
    "needs payment match":
        "bg-intent-warning-bg-light text-intent-warning-text ring-intent-warning-text/25",
    "needs usage match":
        "bg-intent-warning-bg-light text-intent-warning-text ring-intent-warning-text/25",
    "review allocation":
        "bg-intent-warning-bg-light text-intent-warning-text ring-intent-warning-text/25",
};

const STATUS_HINT: Record<ProviderCloseRow["closeStatus"], string> = {
    ready: "The provider statement, usage, and any required Wise payment witness are present.",
    "needs provider check":
        "Usage exists, but no provider statement or billing export has been recorded. No payable cost is inferred.",
    "needs payment match":
        "The provider billed us, but no same-month or adjacent-month Wise payment is matched yet.",
    "needs usage match":
        "A provider statement exists, but no matching Pollen usage was found for this month.",
    "review allocation":
        "Provider cost and internal usage disagree materially. Review how provider cost is allocated to models.",
};

const FUNDING_CLASS: Record<ProviderCloseRow["fundingStatus"], string> = {
    billed: "bg-theme-bg-active text-theme-text-strong ring-theme-border",
    "credit/free":
        "bg-intent-success-bg-bright/15 text-intent-success-text ring-intent-success-bg-bright/30",
    mixed: "bg-intent-info-bg-hover text-intent-info-text ring-intent-info-text/30",
    "needs check":
        "bg-intent-danger-bg-light text-intent-danger-text ring-intent-danger-border/40",
};

function StatusBadge({ row }: { row: ProviderCloseRow }) {
    return (
        <Tooltip triggerAs="span" content={STATUS_HINT[row.closeStatus]}>
            <span
                className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_CLASS[row.closeStatus]}`}
            >
                {row.closeStatus}
            </span>
        </Tooltip>
    );
}

function FundingBadge({ row }: { row: ProviderCloseRow }) {
    const hint =
        row.fundingStatus === "needs check"
            ? "Unknown until the provider statement is checked."
            : row.fundingStatus === "credit/free"
              ? "The checked provider statement creates no cash payable amount."
              : row.fundingStatus === "mixed"
                ? "This month contains both provider-billed and credit-funded usage."
                : "The checked provider statement contains a cash payable amount.";
    return (
        <Tooltip triggerAs="span" content={hint}>
            <span
                className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${FUNDING_CLASS[row.fundingStatus]}`}
            >
                {row.fundingStatus}
            </span>
        </Tooltip>
    );
}

function EvidenceLink({ item }: { item: ProviderCloseEvidence }) {
    const link = driveDocumentLink(item.evidence);
    const label = item.kind === "provider" ? "Bill" : "Wise";
    if (link) {
        return (
            <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-theme-text underline underline-offset-4 hover:text-theme-text-soft"
                title={`${item.source} · ${item.date}`}
            >
                {label}
            </a>
        );
    }
    return (
        <Tooltip
            triggerAs="span"
            content={`${item.source} · ${item.date}\n${item.evidence}`}
        >
            <span className="text-theme-text-soft underline decoration-dotted underline-offset-4">
                {label}
            </span>
        </Tooltip>
    );
}

function modelRows(models: ProviderCloseModelRow[]) {
    return models.map((model) => (
        <TableRow key={`${model.vendor}|${model.model}`}>
            <TableCell />
            <TableCell />
            <TableCell className="pl-8 text-theme-text-soft">
                <span className="mr-2" aria-hidden="true">
                    ↳
                </span>
                {model.model || "Unassigned model"}
            </TableCell>
            <TableCell>
                <Chip intent="neutral" size="sm">
                    model
                </Chip>
            </TableCell>
            <TableCell align="right" numeric className="text-theme-text-soft">
                {fmtUsd(model.retainedRevenueUsd)}
            </TableCell>
            <TableCell align="right" numeric className="text-theme-text-soft">
                {fmtUsd(model.paidComputeCashUsd)}
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell
                align="right"
                numeric
                className={
                    model.paidContributionUsd != null &&
                    model.paidContributionUsd < 0
                        ? "text-intent-danger-text"
                        : "text-theme-text-soft"
                }
            >
                {fmtUsd(model.paidContributionUsd)}
            </TableCell>
            <TableCell align="right" numeric className="text-theme-text-soft">
                {fmtUsd(model.questCashSubsidyUsd)}
            </TableCell>
            <TableCell
                align="right"
                numeric
                className={
                    model.netCashContributionUsd != null &&
                    model.netCashContributionUsd < 0
                        ? "text-intent-danger-text"
                        : "text-theme-text-soft"
                }
            >
                {fmtUsd(model.netCashContributionUsd)}
            </TableCell>
            <TableCell align="right" numeric className="text-theme-text-soft">
                {fmtUsd(model.economicContributionUsd)}
            </TableCell>
            <TableCell />
        </TableRow>
    ));
}

export function ProviderCloseTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const allRows = useMemo(() => providerCloseRows(data), [data]);
    const rows = useMemo(
        () =>
            attentionFirst(
                visibleProviderCloseRows({ rows: allRows, month, vendor }),
            ),
        [allRows, month, vendor],
    );
    const summary = useMemo(() => providerCloseSummary(rows), [rows]);
    const stats = useMemo<StatItem[]>(
        () => [
            {
                label: "Ready",
                value: `${summary.ready} of ${summary.rows}`,
                detail: `${summary.providers} providers`,
                tone:
                    summary.rows > 0 && summary.ready === summary.rows
                        ? "pos"
                        : "base",
            },
            {
                label: "Needs attention",
                value: String(summary.needsAttention),
                detail: "provider-months",
                tone: summary.needsAttention ? "warn" : "pos",
            },
            {
                label: "Retained revenue",
                value: fmtUsd(summary.retainedRevenueUsd),
                detail: "paid Pollen after shares",
            },
            {
                label: "Provider billed",
                value: fmtUsd(summary.billedUsd),
                detail: "cash cost — statements only",
            },
            {
                label: "Credit / free",
                value: fmtUsd(summary.creditFreeUsd),
                detail: "economic cost, not payable",
                tone: "pos",
            },
            {
                label: "Cash contribution",
                value:
                    summary.unknownContributionRows > 0
                        ? `${fmtUsd(summary.netCashContributionUsd)} + unknown`
                        : fmtUsd(summary.netCashContributionUsd),
                detail: "retained revenue − billed",
                tone: summary.netCashContributionUsd < 0 ? "neg" : "pos",
            },
        ],
        [summary],
    );

    const toggle = (key: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    return (
        <>
            <StatCards items={stats} />
            <div className="rounded-xl border border-theme-border/60 bg-surface-opaque/40 px-4 py-3 text-sm text-theme-text-soft">
                <strong className="text-theme-text-strong">Close rule:</strong>{" "}
                usage never creates a bill. A provider statement decides what is
                payable; Wise only confirms when it was paid. Expand a provider
                to see the model allocation.
            </div>
            <TableScroller>
                <DataTable className="min-w-[1180px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>Close</TableHeaderCell>
                            <TableHeaderCell>Month</TableHeaderCell>
                            <TableHeaderCell>Provider / model</TableHeaderCell>
                            <TableHeaderCell>Funding</TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Paid Pollen revenue retained after BYOP and model-provider shares.">
                                    Revenue
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Cash payable from the checked provider statement. Internal usage never fills this value.">
                                    Billed
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Provider usage covered by credits or explicitly verified as free. This is not a cash payable amount.">
                                    Credit / free
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Wise cash payment witness. It may land one month before or after the provider statement.">
                                    Wise paid
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Paid-customer retained revenue minus the cash cost allocated to paid traffic.">
                                    Paid margin
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Cash provider cost allocated to free Quest traffic.">
                                    Quest subsidy
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Current cash contribution: retained paid revenue minus the provider-billed amount.">
                                    Cash today
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Economic contribution if credit-funded usage were valued at its full provider cost.">
                                    After credits
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell>Evidence</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.month}|${row.vendor}`,
                        ).flatMap(({ key, row }) => {
                            const isOpen = expanded.has(key);
                            const hasModels = row.models.length > 0;
                            return [
                                <TableRow key={key}>
                                    <TableCell>
                                        <StatusBadge row={row} />
                                    </TableCell>
                                    <TableCell>
                                        {monthLabel(row.month)}
                                    </TableCell>
                                    <TableCell className="font-semibold">
                                        {hasModels ? (
                                            <button
                                                type="button"
                                                onClick={() => toggle(key)}
                                                aria-expanded={isOpen}
                                                className="inline-flex items-center gap-1.5 text-left hover:text-theme-text"
                                            >
                                                <span
                                                    className="text-theme-text-soft"
                                                    aria-hidden="true"
                                                >
                                                    {isOpen ? "▾" : "▸"}
                                                </span>
                                                {row.vendor}
                                                <span className="font-normal text-theme-text-soft">
                                                    {row.models.length}
                                                </span>
                                            </button>
                                        ) : (
                                            row.vendor
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <FundingBadge row={row} />
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {fmtUsd(row.retainedRevenueUsd)}
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {fmtUsd(row.billedUsd)}
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {fmtUsd(row.creditFreeUsd)}
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        <span
                                            title={
                                                row.cashCoverage ??
                                                "No Wise payment required"
                                            }
                                        >
                                            {fmtUsd(row.wiseCashUsd)}
                                            {row.wiseCashMonth &&
                                            row.wiseCashMonth !== row.month
                                                ? ` · ${monthLabel(row.wiseCashMonth)}`
                                                : ""}
                                        </span>
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {fmtUsd(row.paidContributionUsd)}
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {fmtUsd(row.questCashSubsidyUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={
                                            row.netCashContributionUsd !=
                                                null &&
                                            row.netCashContributionUsd < 0
                                                ? "text-intent-danger-text"
                                                : "font-semibold text-intent-success-text"
                                        }
                                    >
                                        {fmtUsd(row.netCashContributionUsd)}
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {fmtUsd(row.economicContributionUsd)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-2">
                                            {row.evidence.length ? (
                                                row.evidence.map((item) => (
                                                    <EvidenceLink
                                                        key={`${item.kind}|${item.evidence}`}
                                                        item={item}
                                                    />
                                                ))
                                            ) : (
                                                <Chip
                                                    intent="warning"
                                                    size="sm"
                                                >
                                                    Missing
                                                </Chip>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>,
                                ...(isOpen ? modelRows(row.models) : []),
                            ];
                        })}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </>
    );
}
