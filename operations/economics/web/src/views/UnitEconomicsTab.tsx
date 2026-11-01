import {
    CardIcon,
    SproutIcon,
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
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import {
    Gauge,
    type GaugePalette,
    gaugeParts,
} from "../components/EconomicsGauge";
import { useAmountDisplay } from "../components/ReconcilePro";
import { PairedStatCards } from "../components/StatCards";
import {
    type ComputeMode,
    providerMonthComputeMode,
} from "../lib/computeModes";
import { hasVisibleAmount } from "../lib/format";
import { signedToneOrSoft } from "../lib/tone";
import {
    type UnitEconomicsGrain,
    type UnitEconomicsRow,
    type UnitEconomicsView,
    unitEconomicsReport,
    unitEconomicsRows,
    unitPerformancePct,
} from "../lib/unitEconomics";
import type { Data } from "../types";

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

function FullCostResult({ row }: { row: UnitEconomicsRow }) {
    const { fmtUsd, fmtSignedUsd } = useAmountDisplay();
    return (
        <Tooltip
            triggerAs="span"
            content={
                <span className="block max-w-72">
                    <strong>Full-cost result</strong>
                    <span className="block">
                        Retained: {fmtUsd(row.retainedPaidUsd)}
                    </span>
                    <span className="block">
                        Vendor cash: {fmtUsd(row.providerCashUsd)} · credits:{" "}
                        {fmtUsd(row.providerCreditUsd)}
                    </span>
                    <span className="block">
                        Result = retained − cash − credits
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
    const { fmtUsd, fmtSignedUsd } = useAmountDisplay();
    return (
        <Tooltip
            triggerAs="span"
            content={
                <span className="block max-w-72">
                    <strong>Current result · with credits</strong>
                    <span className="block">
                        Retained: {fmtUsd(row.retainedPaidUsd)}
                    </span>
                    <span className="block">
                        Vendor cash: {fmtUsd(row.providerCashUsd)} · consumed
                        credits: {fmtUsd(row.providerCreditUsd)}
                    </span>
                    <span className="block">
                        Result = retained − vendor cash
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
];

const DEFAULT_SORT = {
    key: "fullCostResultUsd",
    direction: "asc",
} as const;

function computeModeLabel(mode: ComputeMode): string {
    if (mode === "managed-inference") return "Inference";
    if (mode === "gpu-capacity") return "GPU";
    if (mode === "mixed") return "Both";
    return "Unclassified";
}

function UnitEconomicsTable({
    data,
    month,
    view,
}: {
    data: Data;
    month: string;
    view: UnitEconomicsView;
}) {
    const { pro, fmtUsd, fmtSignedUsd, fmtMarginPct, fmtUnsignedPct } =
        useAmountDisplay();
    const grain: UnitEconomicsGrain = view === "vendors" ? "provider" : "model";
    const {
        modeIndex,
        vendorMonths,
        summary,
        currentResultUsd,
        fullCostResultUsd,
        provisional,
    } = useMemo(
        () => unitEconomicsReport(data, month, view),
        [data, month, view],
    );
    const rows = useMemo(
        () => unitEconomicsRows(vendorMonths, grain),
        [vendorMonths, grain],
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
        rows.filter(
            (row) =>
                pro ||
                hasVisibleAmount([
                    row.retainedPaidUsd,
                    row.paidPollenUsd,
                    row.questPollenUsd,
                    row.providerCashUsd,
                    row.providerCreditUsd,
                    row.providerUsageUsd,
                    row.netCashContributionUsd,
                    row.economicContributionUsd,
                ]),
        ),
        sortColumns,
        DEFAULT_SORT,
    );
    const usageSplit = gaugeParts(
        summary.paidPollenUsd,
        summary.questPollenUsd,
    );
    const fundingSplit = gaugeParts(
        summary.providerCashUsd,
        summary.providerCreditUsd,
    );
    const percent = (value: number | undefined) => fmtUnsignedPct(value);
    const stats = [
        {
            label: "Pollen used",
            total: `${fmtUsd(summary.paidPollenUsd + summary.questPollenUsd)} total`,
            items: [
                {
                    label: (
                        <span className="inline-flex items-center gap-1.5 text-paid-deep">
                            <CardIcon className="h-3.5 w-3.5" />
                            Paid
                        </span>
                    ),
                    value: fmtUsd(summary.paidPollenUsd),
                    valueClassName: "polli:text-paid-deep",
                    detail: percent(usageSplit?.leftPct),
                },
                {
                    label: (
                        <span className="inline-flex items-center gap-1.5 text-tier-deep">
                            <SproutIcon className="h-3.5 w-3.5" />
                            Quest
                        </span>
                    ),
                    value: fmtUsd(summary.questPollenUsd),
                    valueClassName: "polli:text-tier-deep",
                    detail: percent(
                        usageSplit
                            ? 100 - Math.round(usageSplit.leftPct)
                            : undefined,
                    ),
                },
            ],
            detail: (
                <Gauge
                    className="mt-4 w-full"
                    left={summary.paidPollenUsd}
                    leftLabel="Paid"
                    right={summary.questPollenUsd}
                    rightLabel="Quest"
                />
            ),
        },
        {
            label: "Provider costs",
            total: `${fmtUsd(summary.providerUsageUsd)} total`,
            items: [
                {
                    label: "Cash",
                    value: fmtUsd(summary.providerCashUsd),
                    detail: percent(fundingSplit?.leftPct),
                },
                {
                    label: "Credits",
                    value: fmtUsd(summary.providerCreditUsd),
                    detail: percent(
                        fundingSplit
                            ? 100 - Math.round(fundingSplit.leftPct)
                            : undefined,
                    ),
                },
            ],
            detail: (
                <Gauge
                    className="mt-4 w-full"
                    palette="neutral"
                    left={summary.providerCashUsd}
                    leftLabel="Cash"
                    right={summary.providerCreditUsd}
                    rightLabel="Credits"
                />
            ),
        },
        {
            label: "Result",
            total: data.planningError
                ? "Review unavailable"
                : provisional
                  ? "Provisional"
                  : undefined,
            items: [
                {
                    label: "With credits",
                    value:
                        currentResultUsd == null
                            ? "Unknown"
                            : fmtSignedUsd(currentResultUsd),
                    valueClassName:
                        currentResultUsd == null
                            ? undefined
                            : signedToneOrSoft(currentResultUsd),
                },
                {
                    label: "Without credits",
                    value:
                        fullCostResultUsd == null
                            ? "Unknown"
                            : fmtSignedUsd(fullCostResultUsd),
                    valueClassName:
                        fullCostResultUsd == null
                            ? undefined
                            : signedToneOrSoft(fullCostResultUsd),
                },
            ],
        },
    ];

    return (
        <div className="flex flex-col gap-4">
            <PairedStatCards cards={stats} layout="rows" />

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
                            <TableHeaderCell colSpan={3} align="center">
                                Pollen
                            </TableHeaderCell>
                            <TableHeaderCell colSpan={3} align="center">
                                Vendor cost
                            </TableHeaderCell>
                            <TableHeaderCell colSpan={2} align="center">
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Actual cash outcome while consumed vendor credits cover part of usage.",
                                        formula: "retained − vendor cash",
                                    }}
                                >
                                    Current · with credits
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell colSpan={2} align="center">
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Underlying outcome after valuing consumed vendor credits as costs that may later require cash.",
                                        formula:
                                            "retained − vendor cash − vendor credits",
                                    }}
                                >
                                    Full cost · without credits
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell
                                align="right"
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
                                    <span className="inline-flex items-center gap-1.5 text-paid-deep">
                                        <CardIcon className="h-3.5 w-3.5 shrink-0" />
                                        Retained
                                    </span>
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("pollenMix")}
                            >
                                Usage mix
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("questPollenUsd")}
                            >
                                <span className="inline-flex items-center gap-1.5 text-tier-deep">
                                    <SproutIcon className="h-3.5 w-3.5 shrink-0" />
                                    Quest used
                                </span>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("providerCashUsd")}
                            >
                                Cash
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("providerFundingMix")}
                            >
                                Funding mix
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("providerCreditUsd")}
                            >
                                Credit
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("currentResultUsd")}
                            >
                                Result
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("currentPerformancePct")}
                            >
                                Performance
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("fullCostResultUsd")}
                            >
                                Result
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("fullCostPerformancePct")}
                            >
                                Performance
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
                                                : [
                                                        "missing breakdown",
                                                        "needs mapping",
                                                        "provider only",
                                                    ].includes(
                                                        row.allocationStatus ??
                                                            "",
                                                    )
                                                  ? "Other provider costs"
                                                  : row.model}
                                        </span>
                                    </TableCell>
                                    <TableCell align="right" numeric>
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
                                    <TableCell align="right" numeric>
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
                                    <TableCell align="right" numeric>
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
                                </TableRow>
                            );
                        })}
                        {sortedRows.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={12}
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

export function VendorsTab({ data, month }: { data: Data; month: string }) {
    return <UnitEconomicsTable data={data} month={month} view="vendors" />;
}

export function ManagedInferenceTab({
    data,
    month,
}: {
    data: Data;
    month: string;
}) {
    return <UnitEconomicsTable data={data} month={month} view="inference" />;
}
