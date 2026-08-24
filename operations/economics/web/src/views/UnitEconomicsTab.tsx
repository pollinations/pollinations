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
import {
    type ComputeMode,
    computeModeIndex,
    directDeliveryData,
    managedInferenceData,
    providerMonthComputeMode,
} from "../lib/computeModes";
import { fmtMarginPct, fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    type ModelAllocationStatus,
    type ModelReconcileRow,
    modelReconcileRows,
    modelReconcileSummary,
    visibleModelReconcileRows,
} from "../lib/modelReconcile";
import type { MonthFilterValue } from "../lib/months";
import { signedToneOrSoft } from "../lib/tone";
import {
    isCreditSupported,
    providerCostCheck,
    type UnitEconomicsGrain,
    type UnitEconomicsRow,
    unitEconomicsRows,
    unitPerformancePct,
} from "../lib/unitEconomics";
import type { Data } from "../types";

function fmtSignedUsd(value: number | null): string {
    if (value == null) return "–";
    const formatted = fmtUsd(value);
    return value > 0 ? `+${formatted}` : formatted;
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
            {status === "missing provider" ? "missing vendor" : status}
        </Chip>
    );
}

function VendorCostStatus({ row }: { row: UnitEconomicsRow }) {
    const check = providerCostCheck(row);
    const label =
        check.kind === "provider-level"
            ? "Vendor-level"
            : check.kind === "missing-mapping"
              ? "Unmapped vendor"
              : check.kind === "missing-source"
                ? row.sourceStatus === "pollen only"
                    ? "Missing vendor"
                    : "Missing meter"
                : check.kind === "not-applicable"
                  ? "Not applicable"
                  : check.kind === "utilization"
                    ? `Utilization · ${fmtUnsignedPct(check.value)}`
                    : check.kind === "calibration"
                      ? `Calibration · ${check.value == null ? "–" : `${check.value.toFixed(2)}×`}`
                      : `${check.kind === "review" ? "Review" : "Healthy"} · ${fmtUnsignedPct(check.value)}`;
    const className =
        check.kind === "review" ||
        check.kind === "missing-source" ||
        check.kind === "missing-mapping"
            ? "text-outcome-negative-text"
            : check.kind === "provider-level" || check.kind === "not-applicable"
              ? "text-theme-text-soft"
              : "text-theme-text-strong";
    const explanation =
        check.kind === "provider-level"
            ? "Model costs are allocations. Check the vendor row against the vendor statement."
            : check.kind === "missing-mapping"
              ? "Add this vendor to the canonical registry before interpreting its economics."
              : check.kind === "missing-source"
                ? "One side of the vendor-month comparison is missing."
                : check.kind === "not-applicable"
                  ? "This row has no external vendor cost to reconcile."
                  : check.kind === "utilization"
                    ? "Capacity vendors compare metered demand with reserved capacity cost."
                    : check.kind === "calibration"
                      ? "Mixed vendors use this ratio for calibration, not pass/fail reconciliation."
                      : check.kind === "review"
                        ? "Direct vendor drift exceeds both 25% and $100."
                        : "Direct vendor drift is within the materiality threshold.";

    return (
        <Tooltip
            triggerAs="span"
            content={
                <span className="block max-w-72">
                    <strong>Vendor cost check</strong>
                    <span className="block">
                        Basis: {check.basis.replace("_", " ")}
                    </span>
                    <span className="block">
                        Logged: {fmtUsd(row.pollenMeterUsd)} · Vendor:{" "}
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

function FullCostResult({ row }: { row: UnitEconomicsRow }) {
    return (
        <Tooltip
            triggerAs="span"
            content={
                <span className="block max-w-72">
                    <strong>Full-cost result</strong>
                    <span className="block">
                        Retained Paid: {fmtUsd(row.retainedPaidUsd)}
                    </span>
                    <span className="block">
                        Vendor cash: {fmtUsd(row.providerCashUsd)} · credits:{" "}
                        {fmtUsd(row.providerCreditUsd)}
                    </span>
                    <span className="block">
                        Result = retained Paid − cash − credits
                    </span>
                    <span className="block">
                        Cash-only result:{" "}
                        {fmtSignedUsd(row.netCashContributionUsd)}
                    </span>
                </span>
            }
        >
            <span className={signedToneOrSoft(row.economicContributionUsd)}>
                {fmtSignedUsd(row.economicContributionUsd)}
            </span>
        </Tooltip>
    );
}

function CurrentResult({ row }: { row: UnitEconomicsRow }) {
    return (
        <Tooltip
            triggerAs="span"
            content={
                <span className="block max-w-72">
                    <strong>Current result · with credits</strong>
                    <span className="block">
                        Retained Paid: {fmtUsd(row.retainedPaidUsd)}
                    </span>
                    <span className="block">
                        Vendor cash: {fmtUsd(row.providerCashUsd)} · consumed
                        credits: {fmtUsd(row.providerCreditUsd)}
                    </span>
                    <span className="block">
                        Result = retained Paid − vendor cash
                    </span>
                    <span className="block">
                        Full-cost result:{" "}
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

function CreditSupportedChip({ row }: { row: UnitEconomicsRow }) {
    if (
        !isCreditSupported(
            row.netCashContributionUsd,
            row.economicContributionUsd,
        )
    ) {
        return null;
    }
    return (
        <span className="ml-1 inline-flex">
            <Tooltip
                triggerAs="span"
                content="Cash-positive only because vendor credits covered part of the full cost."
            >
                <Chip intent="warning" size="sm">
                    credit-supported
                </Chip>
            </Tooltip>
        </span>
    );
}

const SORT_COLUMNS: readonly SortColumn<UnitEconomicsRow>[] = [
    { key: "vendor", value: (row) => row.vendor },
    { key: "model", value: (row) => row.model },
    { key: "retainedPaidUsd", value: (row) => row.retainedPaidUsd },
    {
        key: "pollenMix",
        value: (row) => mixShare(row.paidPollenUsd, row.questPollenUsd),
    },
    { key: "questPollenUsd", value: (row) => row.questPollenUsd },
    { key: "providerCashUsd", value: (row) => row.providerCashUsd },
    {
        key: "providerFundingMix",
        value: (row) => mixShare(row.providerCashUsd, row.providerCreditUsd),
    },
    { key: "providerCreditUsd", value: (row) => row.providerCreditUsd },
    { key: "currentResultUsd", value: (row) => row.netCashContributionUsd },
    {
        key: "currentPerformancePct",
        value: (row) =>
            unitPerformancePct(row.netCashContributionUsd, row.retainedPaidUsd),
    },
    { key: "fullCostResultUsd", value: (row) => row.economicContributionUsd },
    {
        key: "fullCostPerformancePct",
        value: (row) =>
            unitPerformancePct(
                row.economicContributionUsd,
                row.retainedPaidUsd,
            ),
    },
    {
        key: "providerCostCheck",
        value: (row) => providerCostCheck(row).value,
    },
];

const DEFAULT_SORT = {
    key: "fullCostResultUsd",
    direction: "asc",
} as const;

type UnitEconomicsView = "vendors" | "inference";
const ACTIVE_ECONOMICS_USD = 0.0001;

function hasEconomicActivity(row: ModelReconcileRow): boolean {
    return [
        row.paidPollenUsd,
        row.questPollenUsd,
        row.pollenMeterUsd,
        row.providerUsageUsd,
    ].some((value) => value != null && Math.abs(value) > ACTIVE_ECONOMICS_USD);
}

function computeModeLabel(mode: ComputeMode): string {
    if (mode === "managed-inference") return "Inference";
    if (mode === "gpu-capacity") return "GPU";
    if (mode === "mixed") return "Both";
    return "Unclassified";
}

function UnitEconomicsTable({
    data,
    month = "",
    view,
}: {
    data: Data;
    month?: MonthFilterValue;
    view: UnitEconomicsView;
}) {
    const grain: UnitEconomicsGrain = view === "vendors" ? "provider" : "model";
    const modeIndex = useMemo(() => computeModeIndex(data), [data]);
    const economicsData = useMemo(
        () =>
            view === "vendors"
                ? directDeliveryData(data)
                : managedInferenceData(data, modeIndex),
        [data, modeIndex, view],
    );
    const allVendorMonths = useMemo(
        () => modelReconcileRows(economicsData),
        [economicsData],
    );
    const vendorMonths = useMemo(
        () =>
            visibleModelReconcileRows({
                rows: allVendorMonths,
                month,
                vendor: "all",
            }).filter(hasEconomicActivity),
        [allVendorMonths, month],
    );
    const rows = useMemo(
        () => unitEconomicsRows(vendorMonths, grain),
        [grain, vendorMonths],
    );
    const vendorEconomics = useMemo(
        () => unitEconomicsRows(vendorMonths, "provider"),
        [vendorMonths],
    );
    const sortColumns = useMemo<readonly SortColumn<UnitEconomicsRow>[]>(
        () =>
            SORT_COLUMNS.map((column) =>
                column.key === "model" && view === "vendors"
                    ? {
                          key: "model",
                          value: (row: UnitEconomicsRow) =>
                              computeModeLabel(
                                  providerMonthComputeMode(
                                      modeIndex,
                                      row.month,
                                      row.vendor,
                                  ),
                              ),
                      }
                    : column,
            ),
        [modeIndex, view],
    );
    const { headerProps, rows: sortedRows } = useSortableRows(
        rows,
        sortColumns,
        DEFAULT_SORT,
    );
    const summary = useMemo(
        () => modelReconcileSummary(vendorMonths),
        [vendorMonths],
    );
    const currentMonth = new Date().toISOString().slice(0, 7);
    const includesPartialMonth = vendorMonths.some(
        (row) => row.month >= currentMonth,
    );
    const knownCurrentRows = vendorEconomics.filter(
        (row) => row.netCashContributionUsd != null,
    );
    const currentResultUsd = knownCurrentRows.reduce(
        (sum, row) => sum + (row.netCashContributionUsd ?? 0),
        0,
    );
    const unknownCurrentVendorMonths =
        vendorEconomics.length - knownCurrentRows.length;
    const currentPerformancePct =
        unknownCurrentVendorMonths === 0
            ? unitPerformancePct(currentResultUsd, summary.retainedPaidUsd)
            : null;
    const knownFullCostRows = vendorEconomics.filter(
        (row) => row.economicContributionUsd != null,
    );
    const fullCostResultUsd = knownFullCostRows.reduce(
        (sum, row) => sum + (row.economicContributionUsd ?? 0),
        0,
    );
    const unknownFullCostVendorMonths =
        vendorEconomics.length - knownFullCostRows.length;
    const fullCostPerformancePct =
        unknownFullCostVendorMonths === 0
            ? unitPerformancePct(fullCostResultUsd, summary.retainedPaidUsd)
            : null;
    const mixedVendorMonths = vendorMonths.filter(
        (row) =>
            view === "inference" &&
            providerMonthComputeMode(modeIndex, row.month, row.vendor) ===
                "mixed",
    ).length;

    const stats = useMemo<StatItem[]>(
        () => [
            {
                label: "Retained Paid",
                value: fmtUsd(summary.retainedPaidUsd),
                detail: (
                    <GaugeSummary
                        left={summary.paidPollenUsd}
                        leftLabel="Paid used"
                        right={summary.questPollenUsd}
                        rightLabel="Quest used"
                    />
                ),
            },
            {
                label: "Quest used",
                value: fmtUsd(summary.questPollenUsd),
                detail: "free usage · never fiat revenue",
            },
            {
                label: "Vendor cost",
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
                label: "Current result",
                value:
                    knownCurrentRows.length === 0
                        ? "Unknown"
                        : `${fmtSignedUsd(currentResultUsd)}${
                              unknownCurrentVendorMonths > 0 ? " + unknown" : ""
                          }`,
                tone:
                    knownCurrentRows.length === 0
                        ? "base"
                        : currentResultUsd > 0
                          ? "pos"
                          : currentResultUsd < 0
                            ? "neg"
                            : "base",
                detail:
                    unknownCurrentVendorMonths > 0
                        ? "with credits · performance incomplete"
                        : `with credits · ${fmtMarginPct(currentPerformancePct)}`,
            },
            {
                label: "Full-cost result",
                value:
                    knownFullCostRows.length === 0
                        ? "Unknown"
                        : `${fmtSignedUsd(fullCostResultUsd)}${
                              unknownFullCostVendorMonths > 0
                                  ? " + unknown"
                                  : ""
                          }`,
                tone:
                    knownFullCostRows.length === 0
                        ? "base"
                        : fullCostResultUsd > 0
                          ? "pos"
                          : fullCostResultUsd < 0
                            ? "neg"
                            : "base",
                detail:
                    unknownFullCostVendorMonths > 0
                        ? "without credits · performance incomplete"
                        : `without credits · ${fmtMarginPct(fullCostPerformancePct)}`,
            },
        ],
        [
            currentPerformancePct,
            currentResultUsd,
            fullCostPerformancePct,
            fullCostResultUsd,
            knownCurrentRows.length,
            knownFullCostRows.length,
            summary,
            unknownCurrentVendorMonths,
            unknownFullCostVendorMonths,
        ],
    );

    return (
        <div className="flex flex-col gap-4">
            <StatCards items={stats} />

            {(includesPartialMonth ||
                summary.missingSideProviderMonths > 0 ||
                mixedVendorMonths > 0) && (
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
                    {mixedVendorMonths > 0 && (
                        <Chip intent="neutral" size="sm">
                            {mixedVendorMonths} mixed month
                            {mixedVendorMonths === 1 ? "" : "s"} unallocated
                        </Chip>
                    )}
                </div>
            )}

            <TableScroller>
                <DataTable className="min-w-[1420px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("vendor")}
                            >
                                Vendor
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("model")}
                            >
                                {view === "vendors" ? "Mode" : "Model"}
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Pollen
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Vendor cost
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Actual cash outcome while consumed vendor credits cover part of usage.",
                                        formula: "retained Paid − vendor cash",
                                    }}
                                >
                                    Current · with credits
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Underlying outcome after valuing consumed vendor credits as costs that may later require cash.",
                                        formula:
                                            "retained Paid − vendor cash − vendor credits",
                                    }}
                                >
                                    Full cost · without credits
                                </HeaderHint>
                            </TableHeaderCell>
                            {view === "vendors" && (
                                <TableHeaderCell
                                    rowSpan={2}
                                    align="right"
                                    className={GROUP_BORDER}
                                    {...headerProps("providerCostCheck")}
                                >
                                    <HeaderHint hint="Whether internal logged cost agrees with vendor evidence. Hover a value for logged cost, vendor actual, gap, and basis.">
                                        Cost check
                                    </HeaderHint>
                                </TableHeaderCell>
                            )}
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("retainedPaidUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Cash-backed Paid Pollen retained after ecosystem shares. Gross Paid usage remains available in the Usage mix tooltip.",
                                        formula:
                                            "Paid used − BYOP share − model-owner share",
                                    }}
                                >
                                    Paid retained
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("pollenMix")}
                            >
                                <HeaderHint hint="Usage mix — amber is Paid Pollen and green is Quest Pollen, using the shared wallet colors.">
                                    Usage mix
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
                                className={GROUP_BORDER}
                                {...headerProps("providerCashUsd")}
                            >
                                <HeaderHint hint="Vendor usage paid with real cash. Model rows receive an allocation from the vendor-month total.">
                                    Cash
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("providerFundingMix")}
                            >
                                <HeaderHint hint="Vendor funding mix — strong neutral is real cash and muted neutral is consumed vendor credit.">
                                    Funding mix
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("providerCreditUsd")}
                            >
                                <HeaderHint hint="Vendor usage funded with consumed vendor credits. Model rows receive an allocation from the vendor-month total.">
                                    Credit
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("currentResultUsd")}
                            >
                                Result
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("currentPerformancePct")}
                            >
                                <HeaderHint hint="Current result divided by retained Paid Pollen.">
                                    Performance
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("fullCostResultUsd")}
                            >
                                Result
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("fullCostPerformancePct")}
                            >
                                <HeaderHint hint="Full-cost result divided by retained Paid Pollen.">
                                    Performance
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
                                        <span className="mr-2 font-semibold">
                                            {row.vendor}
                                        </span>
                                    </TableCell>
                                    <TableCell
                                        className={
                                            view === "vendors"
                                                ? "text-theme-text-soft"
                                                : undefined
                                        }
                                    >
                                        <span className="mr-2">
                                            {view === "vendors"
                                                ? computeModeLabel(
                                                      providerMonthComputeMode(
                                                          modeIndex,
                                                          row.month,
                                                          row.vendor,
                                                      ),
                                                  )
                                                : row.model}
                                        </span>
                                        {view === "inference" &&
                                            allocationWarning(
                                                row.allocationStatus,
                                            )}
                                        <CreditSupportedChip row={row} />
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={GROUP_BORDER}
                                    >
                                        {fmtUsd(row.retainedPaidUsd)}
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
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={GROUP_BORDER}
                                    >
                                        <CurrentResult row={row} />
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={signedToneOrSoft(
                                            unitPerformancePct(
                                                row.netCashContributionUsd,
                                                row.retainedPaidUsd,
                                            ),
                                        )}
                                    >
                                        {fmtMarginPct(
                                            unitPerformancePct(
                                                row.netCashContributionUsd,
                                                row.retainedPaidUsd,
                                            ),
                                        )}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={GROUP_BORDER}
                                    >
                                        <FullCostResult row={row} />
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={signedToneOrSoft(
                                            unitPerformancePct(
                                                row.economicContributionUsd,
                                                row.retainedPaidUsd,
                                            ),
                                        )}
                                    >
                                        {fmtMarginPct(
                                            unitPerformancePct(
                                                row.economicContributionUsd,
                                                row.retainedPaidUsd,
                                            ),
                                        )}
                                    </TableCell>
                                    {view === "vendors" && (
                                        <TableCell
                                            align="right"
                                            className={GROUP_BORDER}
                                        >
                                            <VendorCostStatus row={row} />
                                        </TableCell>
                                    )}
                                </TableRow>
                            );
                        })}
                        {sortedRows.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={view === "vendors" ? 13 : 12}
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

export function VendorsTab({
    data,
    month = "",
}: {
    data: Data;
    month?: MonthFilterValue;
}) {
    return <UnitEconomicsTable data={data} month={month} view="vendors" />;
}

export function ManagedInferenceTab({
    data,
    month = "",
}: {
    data: Data;
    month?: MonthFilterValue;
}) {
    return <UnitEconomicsTable data={data} month={month} view="inference" />;
}
