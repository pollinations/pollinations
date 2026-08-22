import {
    ButtonGroup,
    Chip,
    cn,
    TabButton,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { StatCards, type StatItem } from "../components/StatCards";
import { fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    type ModelAllocationStatus,
    type ModelReconcileStatus,
    modelReconcileRows,
    modelReconcileSummary,
    visibleModelReconcileRows,
} from "../lib/modelReconcile";
import {
    type MonthFilterValue,
    monthLabel,
    type ValueFilter,
} from "../lib/months";
import { signedToneOrSoft, usageMatchTone } from "../lib/tone";
import {
    meterMatchPct,
    type UnitEconomicsGrain,
    type UnitEconomicsRow,
    unitEconomicsRows,
} from "../lib/unitEconomics";
import type { Data } from "../types";

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

function sourceWarning(status: ModelReconcileStatus) {
    if (status === "both sources") return null;
    return (
        <Chip intent="warning" size="sm">
            {status}
        </Chip>
    );
}

function allocationWarning(status: ModelAllocationStatus | null) {
    if (status == null || status === "allocated") return null;
    return (
        <Chip intent="warning" size="sm">
            {status}
        </Chip>
    );
}

const SORT_COLUMNS: readonly SortColumn<UnitEconomicsRow>[] = [
    { key: "month", value: (row) => row.month },
    { key: "vendor", value: (row) => row.vendor },
    { key: "model", value: (row) => row.model },
    { key: "paidPollenUsd", value: (row) => row.paidPollenUsd },
    { key: "questPollenUsd", value: (row) => row.questPollenUsd },
    { key: "retainedPaidUsd", value: (row) => row.retainedPaidUsd },
    {
        key: "paidPollenOnCreditsUsd",
        value: (row) => row.paidPollenOnCreditsUsd,
    },
    {
        key: "questPollenOnCreditsUsd",
        value: (row) => row.questPollenOnCreditsUsd,
    },
    { key: "providerCashUsd", value: (row) => row.providerCashUsd },
    { key: "providerCreditUsd", value: (row) => row.providerCreditUsd },
    { key: "providerUsageUsd", value: (row) => row.providerUsageUsd },
    { key: "paidContributionUsd", value: (row) => row.paidContributionUsd },
    { key: "questCashSubsidyUsd", value: (row) => row.questCashSubsidyUsd },
    {
        key: "netCashContributionUsd",
        value: (row) => row.netCashContributionUsd,
    },
    { key: "pollenMeterUsd", value: (row) => row.pollenMeterUsd },
    { key: "meterGapUsd", value: (row) => row.meterGapUsd },
    {
        key: "meterMatchPct",
        value: (row) => meterMatchPct(row.pollenMeterUsd, row.providerUsageUsd),
    },
];

const DEFAULT_SORT = {
    key: "paidPollenUsd",
    direction: "desc",
} as const;

export function UnitEconomicsTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const [grain, setGrain] = useState<UnitEconomicsGrain>("model");
    const allProviders = useMemo(() => modelReconcileRows(data), [data]);
    const providers = useMemo(
        () =>
            visibleModelReconcileRows({
                rows: allProviders,
                month,
                vendor,
            }),
        [allProviders, month, vendor],
    );
    const modelRows = useMemo(
        () => unitEconomicsRows(providers, "model"),
        [providers],
    );
    const providerRows = useMemo(
        () => unitEconomicsRows(providers, "provider"),
        [providers],
    );
    const rows = grain === "model" ? modelRows : providerRows;
    const { headerProps, rows: sortedRows } = useSortableRows(
        rows,
        SORT_COLUMNS,
        DEFAULT_SORT,
    );
    const summary = useMemo(
        () => modelReconcileSummary(providers),
        [providers],
    );
    const currentMonth = new Date().toISOString().slice(0, 7);
    const includesPartialMonth = providers.some(
        (row) => row.month >= currentMonth,
    );
    const creditBackedPollenUsd =
        summary.paidPollenOnCreditsUsd == null &&
        summary.questPollenOnCreditsUsd == null
            ? null
            : (summary.paidPollenOnCreditsUsd ?? 0) +
              (summary.questPollenOnCreditsUsd ?? 0);
    const unknownFundingPollenUsd =
        summary.paidPollenUnknownFundingUsd +
        summary.questPollenUnknownFundingUsd;

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

    const holeDetail = summary.missingSideProviderMonths
        ? `${summary.missingSideProviderMonths} provider-months missing one side`
        : "all provider-months have both sources";

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="font-semibold">
                        View the same economics by
                    </div>
                    <div className="text-sm text-theme-text-soft">
                        Cards and column definitions stay identical.
                    </div>
                </div>
                <ButtonGroup aria-label="Unit economics view">
                    <TabButton
                        active={grain === "model"}
                        onClick={() => setGrain("model")}
                    >
                        Models · {modelRows.length}
                    </TabButton>
                    <TabButton
                        active={grain === "provider"}
                        onClick={() => setGrain("provider")}
                    >
                        Providers · {providerRows.length}
                    </TabButton>
                </ButtonGroup>
            </div>

            <StatCards items={stats} />

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-theme-border/60 bg-surface-opaque/40 px-4 py-3 text-sm text-theme-text-soft">
                {includesPartialMonth && (
                    <Chip intent="warning" size="sm">
                        partial month
                    </Chip>
                )}
                <span>
                    {grain === "model"
                        ? "Provider cash and credits are allocated to models by their Pollen metered-cost share. Anything that cannot be allocated stays in an explicit row."
                        : "These are the exact same model rows rolled up to provider-month totals."}{" "}
                    {holeDetail}.
                </span>
            </div>

            <TableScroller>
                <DataTable className="min-w-[1840px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("month")}
                            >
                                Month
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("vendor")}
                            >
                                Provider
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("model")}
                            >
                                Model
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Pollen
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                On provider credits
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Provider funding
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Cash result
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Reconciliation
                            </TableHeaderCell>
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("paidPollenUsd")}
                            >
                                <HeaderHint hint="Paid Pollen balance consumed by customers. This is cash-backed usage, not necessarily cash collected in the selected month.">
                                    Paid used
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("questPollenUsd")}
                            >
                                <HeaderHint hint="Quest Pollen consumed by customers. Quest is free usage and never fiat revenue.">
                                    Quest used
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("retainedPaidUsd")}
                            >
                                <HeaderHint hint="Paid Pollen retained after BYOP and community model-provider shares.">
                                    Retained
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("paidPollenOnCreditsUsd")}
                            >
                                <HeaderHint hint="Paid Pollen attributed to provider usage funded with credits, using the provider-month funding share.">
                                    Paid
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("questPollenOnCreditsUsd")}
                            >
                                <HeaderHint hint="Quest Pollen attributed to provider usage funded with credits, using the provider-month funding share.">
                                    Quest
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("providerCashUsd")}
                            >
                                <HeaderHint hint="Provider usage paid with real cash. Model rows receive an allocation from the provider-month total.">
                                    Cash
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("providerCreditUsd")}
                            >
                                <HeaderHint hint="Provider usage funded with consumed provider credits. Model rows receive an allocation from the provider-month total.">
                                    Credit
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("providerUsageUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Total provider usage before credits reduce the cash bill.",
                                        formula: "cash + credit",
                                    }}
                                >
                                    Total
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("paidContributionUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Contribution from paid traffic after its allocated provider cash.",
                                        formula:
                                            "retained paid Pollen − paid traffic cash",
                                    }}
                                >
                                    Paid margin
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("questCashSubsidyUsd")}
                            >
                                <HeaderHint hint="Provider cash spent serving free Quest traffic.">
                                    Quest cost
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("netCashContributionUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Net cash contribution after paid and Quest traffic.",
                                        formula:
                                            "paid margin − Quest cash cost",
                                    }}
                                >
                                    Net
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("pollenMeterUsd")}
                            >
                                <HeaderHint hint="Internal Pollen cost meter for paid and Quest traffic.">
                                    Pollen meter
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("meterGapUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Difference between provider usage and the internal Pollen cost meter.",
                                        formula:
                                            "provider total − Pollen meter",
                                    }}
                                >
                                    Gap
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("meterMatchPct")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "How closely the Pollen cost meter matches provider usage.",
                                        formula:
                                            "min(meter, provider total) ÷ max(meter, provider total)",
                                    }}
                                >
                                    Match %
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            sortedRows,
                            (row) =>
                                `${grain}|${row.month}|${row.vendor}|${row.model}`,
                        ).map(({ key, row }) => {
                            const matchPct = meterMatchPct(
                                row.pollenMeterUsd,
                                row.providerUsageUsd,
                            );
                            return (
                                <TableRow key={key}>
                                    <TableCell>
                                        {monthLabel(row.month)}
                                    </TableCell>
                                    <TableCell>
                                        <span className="mr-2 font-semibold">
                                            {row.vendor}
                                        </span>
                                        {grain === "provider" &&
                                            sourceWarning(row.sourceStatus)}
                                    </TableCell>
                                    <TableCell
                                        className={
                                            grain === "provider"
                                                ? "text-theme-text-soft"
                                                : undefined
                                        }
                                    >
                                        <span className="mr-2">
                                            {row.model}
                                        </span>
                                        {grain === "model" &&
                                            allocationWarning(
                                                row.allocationStatus,
                                            )}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={cn(
                                            GROUP_BORDER,
                                            "text-intent-success-text",
                                        )}
                                    >
                                        {fmtUsd(row.paidPollenUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className="text-intent-warning-text"
                                    >
                                        {fmtUsd(row.questPollenUsd)}
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {fmtUsd(row.retainedPaidUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={GROUP_BORDER}
                                    >
                                        {fmtUsd(row.paidPollenOnCreditsUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className="text-intent-warning-text"
                                    >
                                        {fmtUsd(row.questPollenOnCreditsUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={GROUP_BORDER}
                                    >
                                        {fmtUsd(row.providerCashUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className="text-intent-warning-text"
                                    >
                                        {fmtUsd(row.providerCreditUsd)}
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {fmtUsd(row.providerUsageUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={cn(
                                            GROUP_BORDER,
                                            signedToneOrSoft(
                                                row.paidContributionUsd,
                                            ),
                                        )}
                                    >
                                        {fmtSignedUsd(row.paidContributionUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={
                                            row.questCashSubsidyUsd == null
                                                ? "text-theme-text-soft"
                                                : row.questCashSubsidyUsd > 0
                                                  ? "text-intent-danger-text"
                                                  : "text-theme-text-soft"
                                        }
                                    >
                                        {fmtUsd(row.questCashSubsidyUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={signedToneOrSoft(
                                            row.netCashContributionUsd,
                                        )}
                                    >
                                        {fmtSignedUsd(
                                            row.netCashContributionUsd,
                                        )}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={GROUP_BORDER}
                                    >
                                        {fmtUsd(row.pollenMeterUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={usageMatchTone(matchPct)}
                                    >
                                        {fmtSignedUsd(row.meterGapUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={usageMatchTone(matchPct)}
                                    >
                                        {fmtUnsignedPct(matchPct)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {sortedRows.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={17}
                                    className="py-8 text-center text-theme-text-soft"
                                >
                                    No unit economics for this selection.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
