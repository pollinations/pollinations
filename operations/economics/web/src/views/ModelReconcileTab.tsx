import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import { DataTable, HeaderHint, TableScroller } from "../components/DataTable";
import { StatCards, type StatItem } from "../components/StatCards";
import { fmtUsd } from "../lib/format";
import {
    type ModelAllocationRow,
    type ModelReconcileRow,
    modelReconcileRows,
    modelReconcileSummary,
    visibleModelReconcileRows,
} from "../lib/modelReconcile";
import {
    type MonthFilterValue,
    monthLabel,
    type ValueFilter,
} from "../lib/months";
import { signedToneOrSoft } from "../lib/tone";
import type { Data } from "../types";

type DisplayRow = Pick<
    ModelReconcileRow,
    | "meterGapUsd"
    | "netCashContributionUsd"
    | "paidContributionUsd"
    | "paidPollenOnCreditsUsd"
    | "paidPollenUsd"
    | "providerCashUsd"
    | "providerCreditUsd"
    | "providerUsageUsd"
    | "questCashSubsidyUsd"
    | "questPollenOnCreditsUsd"
    | "questPollenUsd"
    | "retainedPaidUsd"
>;

function fmtSignedUsd(value: number | null): string {
    if (value == null) return "–";
    const formatted = fmtUsd(value);
    return value > 0 ? `+${formatted}` : formatted;
}

function fmtCashImpact(value: number | null): string {
    if (value == null) return "–";
    if (value > 0) return `−${fmtUsd(value)}`;
    if (value < 0) return `+${fmtUsd(-value)}`;
    return fmtUsd(0);
}

function statusChip(status: ModelReconcileRow["status"]) {
    if (status === "both sources") {
        return (
            <Chip intent="neutral" size="sm">
                both
            </Chip>
        );
    }
    return (
        <Chip intent="warning" size="sm">
            {status}
        </Chip>
    );
}

function allocationChip(status: ModelAllocationRow["status"]) {
    return (
        <Chip intent={status === "allocated" ? "neutral" : "warning"} size="sm">
            {status}
        </Chip>
    );
}

function EconomicsCells({
    row,
    soft = false,
}: {
    row: DisplayRow;
    soft?: boolean;
}) {
    const textClass = soft ? "text-theme-text-soft" : undefined;
    const fundingDetail =
        row.providerUsageUsd == null
            ? "funding unknown"
            : `cash ${fmtUsd(row.providerCashUsd)} · credits ${fmtUsd(row.providerCreditUsd)}`;
    const contributionDetail =
        row.paidContributionUsd == null || row.questCashSubsidyUsd == null
            ? "paid / Quest split unknown"
            : `paid ${fmtSignedUsd(row.paidContributionUsd)} · Quest ${fmtCashImpact(row.questCashSubsidyUsd)}`;

    return (
        <>
            <TableCell align="right" numeric className={textClass}>
                <div>{fmtUsd(row.paidPollenUsd)}</div>
                <div className="mt-0.5 text-xs font-normal text-theme-text-soft">
                    retained {fmtUsd(row.retainedPaidUsd)} · on credits{" "}
                    {fmtUsd(row.paidPollenOnCreditsUsd)}
                </div>
            </TableCell>
            <TableCell align="right" numeric className={textClass}>
                <div>{fmtUsd(row.questPollenUsd)}</div>
                <div className="mt-0.5 text-xs font-normal text-theme-text-soft">
                    on credits {fmtUsd(row.questPollenOnCreditsUsd)}
                </div>
            </TableCell>
            <TableCell align="right" numeric className={textClass}>
                <div>{fmtUsd(row.providerUsageUsd)}</div>
                <div className="mt-0.5 text-xs font-normal text-theme-text-soft">
                    {fundingDetail}
                </div>
                {row.meterGapUsd != null && (
                    <div className="mt-0.5 text-xs font-normal text-theme-text-soft">
                        meter gap {fmtSignedUsd(row.meterGapUsd)}
                    </div>
                )}
            </TableCell>
            <TableCell
                align="right"
                numeric
                className={
                    soft
                        ? "text-theme-text-soft"
                        : signedToneOrSoft(row.netCashContributionUsd)
                }
            >
                <div>{fmtSignedUsd(row.netCashContributionUsd)}</div>
                <div className="mt-0.5 text-xs font-normal text-theme-text-soft">
                    {contributionDetail}
                </div>
            </TableCell>
        </>
    );
}

function ModelRow({ row }: { row: ModelAllocationRow }) {
    return (
        <TableRow>
            <TableCell />
            <TableCell className="pl-8 text-theme-text-soft">
                <span className="mr-2" aria-hidden="true">
                    ↳
                </span>
                <span className="mr-2">{row.model}</span>
                {allocationChip(row.status)}
            </TableCell>
            <EconomicsCells row={row} soft />
        </TableRow>
    );
}

export function ModelReconcileTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const allRows = useMemo(() => modelReconcileRows(data), [data]);
    const rows = useMemo(
        () => visibleModelReconcileRows({ rows: allRows, month, vendor }),
        [allRows, month, vendor],
    );
    const summary = useMemo(() => modelReconcileSummary(rows), [rows]);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const includesPartialMonth = rows.some((row) => row.month >= currentMonth);
    const creditBackedPollenUsd =
        summary.paidPollenOnCreditsUsd == null &&
        summary.questPollenOnCreditsUsd == null
            ? null
            : (summary.paidPollenOnCreditsUsd ?? 0) +
              (summary.questPollenOnCreditsUsd ?? 0);
    const unknownFundingPollenUsd =
        summary.paidPollenUnknownFundingUsd +
        summary.questPollenUnknownFundingUsd;
    const holeDetail = summary.missingSideProviderMonths
        ? `${summary.missingSideProviderMonths} provider-months missing one side`
        : "all provider-months have both sources";

    const stats = useMemo<StatItem[]>(
        () => [
            {
                label: "Paid Pollen used",
                value: fmtUsd(summary.paidPollenUsd),
                detail: `${fmtUsd(summary.retainedPaidUsd)} retained · cash collected when packs sold`,
            },
            {
                label: "Quest Pollen used",
                value: fmtUsd(summary.questPollenUsd),
                detail: "free balance · never fiat revenue",
            },
            {
                label: "Provider funding",
                value: fmtUsd(summary.providerUsageUsd),
                detail: `cash ${fmtUsd(summary.providerCashUsd)} · credits ${fmtUsd(summary.providerCreditUsd)}`,
            },
            {
                label: "Pollen on credits",
                value: fmtUsd(creditBackedPollenUsd),
                detail: `paid ${fmtUsd(summary.paidPollenOnCreditsUsd)} · Quest ${fmtUsd(summary.questPollenOnCreditsUsd)}${
                    unknownFundingPollenUsd > 0
                        ? ` · ${fmtUsd(unknownFundingPollenUsd)} unknown`
                        : ""
                }`,
            },
            {
                label: "Net cash contribution",
                value: fmtSignedUsd(summary.netCashContributionUsd),
                tone:
                    summary.netCashContributionUsd == null
                        ? "base"
                        : summary.netCashContributionUsd >= 0
                          ? "pos"
                          : "neg",
                detail:
                    summary.paidContributionUsd == null ||
                    summary.questCashSubsidyUsd == null
                        ? "paid / Quest split unknown"
                        : `paid ${fmtSignedUsd(summary.paidContributionUsd)} · Quest ${fmtCashImpact(summary.questCashSubsidyUsd)}`,
            },
        ],
        [creditBackedPollenUsd, summary, unknownFundingPollenUsd],
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
        <div className="flex flex-col gap-4">
            <StatCards items={stats} />
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-theme-border/60 bg-surface-opaque/40 px-4 py-3 text-sm text-theme-text-soft">
                {includesPartialMonth && (
                    <Chip intent="warning" size="sm">
                        partial month
                    </Chip>
                )}
                <span>
                    Paid Pollen is cash-backed usage, not Stripe cash collected
                    in this month. Quest is free usage. Provider cash and
                    credits are allocated by each model&apos;s paid / Quest cost
                    share; missing data stays unknown. {holeDetail}.
                </span>
            </div>
            <TableScroller>
                <DataTable className="min-w-[940px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>Month</TableHeaderCell>
                            <TableHeaderCell>Provider / model</TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Paid balance consumed by customers. Retained removes BYOP and model-provider shares; credit-backed is allocated from the provider's monthly funding mix.">
                                    Paid Pollen
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Quest balance consumed by customers. This is free usage, not fiat revenue.">
                                    Quest Pollen
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint hint="Provider usage funded with cash and consumed credits. The meter gap is provider usage minus our internal Pollen cost meter.">
                                    Provider funding
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell align="right">
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Cash contribution after serving paid and Quest traffic.",
                                        formula:
                                            "retained paid Pollen − all provider cash; paid contribution − Quest cash subsidy",
                                    }}
                                >
                                    Net cash
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => {
                            const key = `${row.month}|${row.vendor}`;
                            const isOpen = expanded.has(key);
                            return [
                                <TableRow key={key}>
                                    <TableCell>
                                        {monthLabel(row.month)}
                                    </TableCell>
                                    <TableCell className="font-semibold">
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
                                            {statusChip(row.status)}
                                        </button>
                                    </TableCell>
                                    <EconomicsCells row={row} />
                                </TableRow>,
                                ...(isOpen
                                    ? row.models.map((model) => (
                                          <ModelRow
                                              key={`${key}|${model.model}|${model.status}`}
                                              row={model}
                                          />
                                      ))
                                    : []),
                            ];
                        })}
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="py-8 text-center text-theme-text-soft"
                                >
                                    No model economics for this selection.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
