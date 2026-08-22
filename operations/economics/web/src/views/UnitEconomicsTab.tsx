import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Tooltip,
} from "@pollinations/ui";
import { useMemo } from "react";
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
    Gauge,
    type GaugePalette,
    GaugeSummary,
} from "../components/EconomicsGauge";
import { StatCards, type StatItem } from "../components/StatCards";
import { computeModeIndex, managedInferenceData } from "../lib/computeModes";
import { fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    type ModelAllocationStatus,
    modelReconcileRows,
    modelReconcileSummary,
    visibleModelReconcileRows,
} from "../lib/modelReconcile";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    monthLabel,
    type ValueFilter,
} from "../lib/months";
import { signedToneOrSoft } from "../lib/tone";
import {
    providerCostCheck,
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

function mixShare(left: number | null, right: number | null): number | null {
    if (left == null || right == null) return null;
    const total = Math.max(0, left) + Math.max(0, right);
    return total > 0 ? Math.max(0, left) / total : null;
}

function MixGauge({
    left,
    leftLabel,
    palette = "wallet",
    right,
    rightLabel,
}: {
    left: number | null;
    leftLabel: string;
    palette?: GaugePalette;
    right: number | null;
    rightLabel: string;
}) {
    if (left == null || right == null) {
        return <span className="text-theme-text-soft">–</span>;
    }
    return (
        <Gauge
            left={left}
            leftLabel={leftLabel}
            palette={palette}
            right={right}
            rightLabel={rightLabel}
        />
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

function ProviderCostStatus({ row }: { row: UnitEconomicsRow }) {
    const check = providerCostCheck(row);
    const label =
        check.kind === "provider-level"
            ? "Provider-level"
            : check.kind === "missing-source"
              ? row.sourceStatus === "pollen only"
                  ? "Missing provider"
                  : "Missing meter"
              : check.kind === "not-applicable"
                ? "Not applicable"
                : check.kind === "utilization"
                  ? `Utilization · ${fmtUnsignedPct(check.value)}`
                  : check.kind === "calibration"
                    ? `Calibration · ${check.value == null ? "–" : `${check.value.toFixed(2)}×`}`
                    : `${check.kind === "review" ? "Review" : "Healthy"} · ${fmtUnsignedPct(check.value)}`;
    const className =
        check.kind === "review" || check.kind === "missing-source"
            ? "text-outcome-negative-text"
            : check.kind === "provider-level" || check.kind === "not-applicable"
              ? "text-theme-text-soft"
              : "text-theme-text-strong";
    const explanation =
        check.kind === "provider-level"
            ? "Model costs are allocations. Check the provider row against the provider statement."
            : check.kind === "missing-source"
              ? "One side of the provider-month comparison is missing."
              : check.kind === "not-applicable"
                ? "This row has no external provider cost to reconcile."
                : check.kind === "utilization"
                  ? "Capacity providers compare metered demand with reserved capacity cost."
                  : check.kind === "calibration"
                    ? "Mixed providers use this ratio for calibration, not pass/fail reconciliation."
                    : check.kind === "review"
                      ? "Direct provider drift exceeds both 25% and $100."
                      : "Direct provider drift is within the materiality threshold.";

    return (
        <Tooltip
            triggerAs="span"
            content={
                <span className="block max-w-72">
                    <strong>Provider cost check</strong>
                    <span className="block">
                        Basis: {check.basis.replace("_", " ")}
                    </span>
                    <span className="block">
                        Logged: {fmtUsd(row.pollenMeterUsd)} · Provider:{" "}
                        {fmtUsd(row.providerUsageUsd)} · Gap:{" "}
                        {fmtSignedUsd(row.meterGapUsd)}
                    </span>
                    <span className="block">{explanation}</span>
                </span>
            }
        >
            <span className={className}>{label}</span>
        </Tooltip>
    );
}

function ContributionValue({ row }: { row: UnitEconomicsRow }) {
    return (
        <Tooltip
            triggerAs="span"
            content={
                <span className="block max-w-72">
                    <strong>Net cash contribution</strong>
                    <span className="block">
                        Paid margin: {fmtSignedUsd(row.paidContributionUsd)}
                    </span>
                    <span className="block">
                        Quest cash cost:{" "}
                        {fmtCashImpact(row.questCashSubsidyUsd)}
                    </span>
                    <span className="block">
                        Net = paid margin − Quest cash cost
                    </span>
                    <span className="block">
                        After credits:{" "}
                        {fmtSignedUsd(row.economicContributionUsd)}
                    </span>
                </span>
            }
        >
            <span className={signedToneOrSoft(row.netCashContributionUsd)}>
                {fmtSignedUsd(row.netCashContributionUsd)}
            </span>
        </Tooltip>
    );
}

const SORT_COLUMNS: readonly SortColumn<UnitEconomicsRow>[] = [
    { key: "month", value: (row) => row.month },
    { key: "vendor", value: (row) => row.vendor },
    { key: "model", value: (row) => row.model },
    { key: "paidPollenUsd", value: (row) => row.paidPollenUsd },
    {
        key: "pollenMix",
        value: (row) => mixShare(row.paidPollenUsd, row.questPollenUsd),
    },
    { key: "questPollenUsd", value: (row) => row.questPollenUsd },
    { key: "retainedPaidUsd", value: (row) => row.retainedPaidUsd },
    { key: "providerCashUsd", value: (row) => row.providerCashUsd },
    {
        key: "providerFundingMix",
        value: (row) => mixShare(row.providerCashUsd, row.providerCreditUsd),
    },
    { key: "providerCreditUsd", value: (row) => row.providerCreditUsd },
    { key: "providerUsageUsd", value: (row) => row.providerUsageUsd },
    {
        key: "netCashContributionUsd",
        value: (row) => row.netCashContributionUsd,
    },
    {
        key: "providerCostCheck",
        value: (row) => providerCostCheck(row).value,
    },
];

const DEFAULT_SORT = {
    key: "paidPollenUsd",
    direction: "desc",
} as const;

export function ManagedInferenceTab({
    data,
    grain,
    month = "",
    vendor = "all",
}: {
    data: Data;
    grain: UnitEconomicsGrain;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const modeIndex = useMemo(() => computeModeIndex(data), [data]);
    const inferenceData = useMemo(
        () => managedInferenceData(data, modeIndex),
        [data, modeIndex],
    );
    const allProviders = useMemo(
        () => modelReconcileRows(inferenceData),
        [inferenceData],
    );
    const providers = useMemo(
        () =>
            visibleModelReconcileRows({
                rows: allProviders,
                month,
                vendor,
            }),
        [allProviders, month, vendor],
    );
    const rows = useMemo(
        () => unitEconomicsRows(providers, grain),
        [grain, providers],
    );
    const providerEconomics = useMemo(
        () => unitEconomicsRows(providers, "provider"),
        [providers],
    );
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
    const knownEconomicRows = providerEconomics.filter(
        (row) => row.economicContributionUsd != null,
    );
    const economicContributionUsd = knownEconomicRows.reduce(
        (sum, row) => sum + (row.economicContributionUsd ?? 0),
        0,
    );
    const unknownEconomicProviderMonths =
        providerEconomics.length - knownEconomicRows.length;
    const mixedProviderMonths = modeIndex.providerMonths.filter(
        (row) =>
            row.mode === "mixed" &&
            matchesMonth(row.month, month) &&
            matchesValue(row.provider, vendor),
    ).length;

    const stats = useMemo<StatItem[]>(
        () => [
            {
                label: "Pollen used",
                value: fmtUsd(summary.paidPollenUsd + summary.questPollenUsd),
                detail: (
                    <GaugeSummary
                        left={summary.paidPollenUsd}
                        leftLabel="Paid"
                        right={summary.questPollenUsd}
                        rightLabel="Quest"
                    />
                ),
            },
            {
                label: "Retained Paid",
                value: fmtUsd(summary.retainedPaidUsd),
                detail: "after BYOP shares",
            },
            {
                label: "Provider funding",
                value: fmtUsd(summary.providerUsageUsd),
                detail: (
                    <GaugeSummary
                        left={summary.providerCashUsd}
                        leftLabel="cash"
                        palette="neutral"
                        right={summary.providerCreditUsd}
                        rightLabel="credit"
                    />
                ),
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
                        : summary.netCashContributionUsd > 0
                          ? "pos"
                          : summary.netCashContributionUsd < 0
                            ? "neg"
                            : "base",
                detail:
                    summary.paidContributionUsd == null ||
                    summary.questCashSubsidyUsd == null
                        ? "paid / Quest split unknown"
                        : `paid ${fmtSignedUsd(summary.paidContributionUsd)} · Quest ${fmtCashImpact(summary.questCashSubsidyUsd)}`,
            },
            {
                label: "After credits",
                value:
                    knownEconomicRows.length === 0
                        ? "Unknown"
                        : `${fmtSignedUsd(economicContributionUsd)}${
                              unknownEconomicProviderMonths > 0
                                  ? " + unknown"
                                  : ""
                          }`,
                tone:
                    knownEconomicRows.length === 0
                        ? "base"
                        : economicContributionUsd > 0
                          ? "pos"
                          : economicContributionUsd < 0
                            ? "neg"
                            : "base",
                detail: "retained Paid − cash − credits",
            },
        ],
        [
            creditBackedPollenUsd,
            economicContributionUsd,
            knownEconomicRows.length,
            summary,
            unknownEconomicProviderMonths,
            unknownFundingPollenUsd,
        ],
    );

    return (
        <div className="flex flex-col gap-4">
            <StatCards items={stats} />

            {(includesPartialMonth ||
                summary.missingSideProviderMonths > 0 ||
                mixedProviderMonths > 0) && (
                <div className="flex flex-wrap items-center gap-2">
                    {includesPartialMonth && (
                        <Chip intent="warning" size="sm">
                            partial month
                        </Chip>
                    )}
                    {summary.missingSideProviderMonths > 0 && (
                        <Chip intent="warning" size="sm">
                            {summary.missingSideProviderMonths} source gap
                            {summary.missingSideProviderMonths === 1 ? "" : "s"}
                        </Chip>
                    )}
                    {mixedProviderMonths > 0 && (
                        <Chip intent="neutral" size="sm">
                            {mixedProviderMonths} mixed month
                            {mixedProviderMonths === 1 ? "" : "s"} unallocated
                        </Chip>
                    )}
                </div>
            )}

            <TableScroller>
                <DataTable className="min-w-[1380px]">
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
                                colSpan={4}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Pollen
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={4}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Provider funding
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("netCashContributionUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Cash retained after the provider cash used for Paid and Quest traffic. Hover a value for the split and the result after valuing credits.",
                                        formula:
                                            "paid margin − Quest cash cost",
                                    }}
                                >
                                    Contribution
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("providerCostCheck")}
                            >
                                <HeaderHint hint="Whether internal logged cost agrees with provider evidence. Hover a value for logged cost, provider actual, gap, and basis.">
                                    Cost check
                                </HeaderHint>
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
                                align="center"
                                {...headerProps("pollenMix")}
                            >
                                <HeaderHint hint="Usage mix — amber is Paid Pollen and green is Quest Pollen, using the shared wallet colors.">
                                    Paid / Quest
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
                                <HeaderHint hint="Paid Pollen retained after BYOP shares. Community models are reported separately.">
                                    Retained
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
                                align="center"
                                {...headerProps("providerFundingMix")}
                            >
                                <HeaderHint hint="Provider funding mix — strong neutral is real cash and muted neutral is consumed provider credit.">
                                    Cash / Credit
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
                                    Actual
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
                            return (
                                <TableRow key={key}>
                                    <TableCell>
                                        {monthLabel(row.month)}
                                    </TableCell>
                                    <TableCell>
                                        <span className="mr-2 font-semibold">
                                            {row.vendor}
                                        </span>
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
                                        className={GROUP_BORDER}
                                    >
                                        {fmtUsd(row.paidPollenUsd)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center">
                                            <MixGauge
                                                left={row.paidPollenUsd}
                                                leftLabel="paid"
                                                right={row.questPollenUsd}
                                                rightLabel="Quest"
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell align="right" numeric>
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
                                        {fmtUsd(row.providerCashUsd)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center">
                                            <MixGauge
                                                left={row.providerCashUsd}
                                                leftLabel="cash"
                                                palette="neutral"
                                                right={row.providerCreditUsd}
                                                rightLabel="credit"
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {fmtUsd(row.providerCreditUsd)}
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {fmtUsd(row.providerUsageUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={GROUP_BORDER}
                                    >
                                        <ContributionValue row={row} />
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={GROUP_BORDER}
                                    >
                                        <ProviderCostStatus row={row} />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {sortedRows.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={13}
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
