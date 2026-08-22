import {
    Chip,
    cn,
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
import { Gauge, GaugeSummary } from "../components/EconomicsGauge";
import { StatCards } from "../components/StatCards";
import {
    computeModeIndex,
    providerMonthComputeMode,
} from "../lib/computeModes";
import {
    fmtMarginPct,
    fmtNumber,
    fmtUnsignedPct,
    fmtUsd,
    fmtUsd4,
} from "../lib/format";
import { toUsd } from "../lib/fx";
import {
    opCloudCreditBurnUsd,
    opCloudMonth,
    opCloudPaidBurnUsd,
} from "../lib/insights";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    monthLabel,
    type ValueFilter,
    WINDOW_START,
} from "../lib/months";
import { canonicalVendor } from "../lib/tb";
import { signedToneOrSoft } from "../lib/tone";
import type { Data } from "../types";

const REGISTRY_UNIT_PRICES: Record<string, { price: number; unit: string }> = {
    zimage: { price: 0.002, unit: "img" },
    klein: { price: 0.01, unit: "img" },
    "ltx-2": { price: 0.005, unit: "s" },
};

export type GpuEconomicsRow = {
    vendor: string;
    models: string;
    month: string;
    rentUsd: number;
    paidRentUsd: number;
    creditRentUsd: number;
    requests: number;
    paidUsd: number;
    questUsd: number;
    retainedUsd: number;
    cashMarginUsd: number;
    cashMarginPct: number | null;
    marginUsd: number;
    marginPct: number | null;
    effUsdPerReq: number | null;
    breakEven: { model: string; unit: string; volume: number }[];
    flags: string[];
};

type GpuSummary = {
    paidUsd: number;
    questUsd: number;
    rentUsd: number;
    paidRentUsd: number;
    creditRentUsd: number;
    retainedUsd: number;
    cashMarginUsd: number;
    cashMarginPct: number | null;
    marginUsd: number;
    marginPct: number | null;
    flaggedRows: number;
    mixedRows: number;
};

function splitModels(model: string): string[] {
    return model
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
}

function computeBreakEven(
    models: string[],
    rentUsd: number,
): { model: string; unit: string; volume: number }[] {
    if (rentUsd <= 0) return [];
    const result: { model: string; unit: string; volume: number }[] = [];
    for (const model of models) {
        const entry = REGISTRY_UNIT_PRICES[model];
        if (!entry) continue;
        result.push({
            model,
            unit: entry.unit,
            volume: rentUsd / entry.price,
        });
    }
    return result;
}

export function demandCoveragePct(
    pollenDemandUsd: number,
    gpuCostUsd: number,
): number | null {
    return gpuCostUsd > 0
        ? (Math.max(0, pollenDemandUsd) / gpuCostUsd) * 100
        : null;
}

// GPU rent is attributed at vendor+month grain, not per-pod or per-model:
// generation_event_v2's provider field is real per-request ground truth, but a
// pod's manually-entered "model" label isn't (one host can run several
// models at once), so splitting rent across models would just be a guess
// dressed up as precision. This is still biased when a vendor's Pollen
// traffic includes usage not actually served by the GPU we rent from them.
// Mixed inference/GPU provider-months therefore keep Pollen unallocated until
// real per-request GPU tagging exists.
export function gpuEconomics(data: Data, monthFilter: MonthFilterValue) {
    type Acc = GpuEconomicsRow & {
        modelSet: Set<string>;
    };
    const groups = new Map<string, Acc>();
    const modeIndex = computeModeIndex(data);

    for (const row of data.opCloud ?? []) {
        if (row.type !== "gpu" || canonicalVendor(row.vendor) === "community") {
            continue;
        }
        const month = opCloudMonth(row);
        if (month < WINDOW_START || !matchesMonth(month, monthFilter)) {
            continue;
        }
        const paidRentUsd = opCloudPaidBurnUsd(row);
        const creditRentUsd = opCloudCreditBurnUsd(row);
        const rentUsd = paidRentUsd + creditRentUsd;
        // Keep refund rows (negative paid burn) so they reduce the group's
        // rent — skipping them would overstate GPU rent vs the Providers tab.
        if (paidRentUsd === 0 && creditRentUsd === 0) continue;

        const key = `${month}|${row.vendor}`;
        const acc = groups.get(key) ?? {
            vendor: row.vendor,
            models: "",
            month,
            rentUsd: 0,
            paidRentUsd: 0,
            creditRentUsd: 0,
            requests: 0,
            paidUsd: 0,
            questUsd: 0,
            retainedUsd: 0,
            cashMarginUsd: 0,
            cashMarginPct: null,
            marginUsd: 0,
            marginPct: null,
            effUsdPerReq: null,
            breakEven: [],
            flags: [],
            modelSet: new Set<string>(),
        };
        acc.rentUsd += rentUsd;
        acc.paidRentUsd += paidRentUsd;
        acc.creditRentUsd += creditRentUsd;
        for (const modelName of splitModels(row.model)) {
            acc.modelSet.add(modelName);
        }
        groups.set(key, acc);
    }

    for (const pollen of data.opPollen ?? []) {
        if (
            canonicalVendor(pollen.vendor) === "community" ||
            pollen.month < WINDOW_START ||
            !matchesMonth(pollen.month, monthFilter)
        ) {
            continue;
        }
        if (
            providerMonthComputeMode(modeIndex, pollen.month, pollen.vendor) !==
            "gpu-capacity"
        ) {
            continue;
        }
        const acc = groups.get(`${pollen.month}|${pollen.vendor}`);
        if (!acc) continue;

        acc.requests += pollen.requests_paid + pollen.requests_quests;
        acc.paidUsd += toUsd(pollen.price_paid, pollen.currency, pollen.month);
        acc.questUsd += toUsd(
            pollen.price_quests,
            pollen.currency,
            pollen.month,
        );
        acc.retainedUsd += toUsd(
            pollen.price_paid - pollen.byop_paid - pollen.model_paid,
            pollen.currency,
            pollen.month,
        );
    }

    return [...groups.values()]
        .map((row): GpuEconomicsRow => {
            const models = [...row.modelSet].sort();
            const flags: string[] = [];
            const mode = providerMonthComputeMode(
                modeIndex,
                row.month,
                row.vendor,
            );
            if (models.length === 0) flags.push("missing model");
            if (mode === "mixed") {
                flags.push("mixed mode · Pollen unallocated");
            } else if (models.length > 0 && row.requests <= 0) {
                flags.push("no Pollen demand");
            }
            const cashMarginUsd = row.retainedUsd - row.paidRentUsd;
            const marginUsd = row.retainedUsd - row.rentUsd;
            return {
                ...row,
                models: models.join(", "),
                cashMarginUsd,
                cashMarginPct:
                    row.retainedUsd > 0
                        ? (cashMarginUsd / row.retainedUsd) * 100
                        : null,
                marginUsd,
                marginPct:
                    row.retainedUsd > 0
                        ? (marginUsd / row.retainedUsd) * 100
                        : null,
                effUsdPerReq:
                    row.requests > 0 ? row.rentUsd / row.requests : null,
                breakEven: computeBreakEven(models, row.rentUsd),
                flags,
            };
        })
        .sort((a, b) => {
            if (a.marginPct == null && b.marginPct == null) {
                return a.marginUsd - b.marginUsd || b.rentUsd - a.rentUsd;
            }
            if (a.marginPct == null) return 1;
            if (b.marginPct == null) return -1;
            return a.marginPct - b.marginPct || b.rentUsd - a.rentUsd;
        });
}

export function visibleGpuRows(rows: GpuEconomicsRow[], vendor: ValueFilter) {
    return rows.filter((row) => matchesValue(row.vendor, vendor));
}

export function gpuSummary(rows: GpuEconomicsRow[]): GpuSummary {
    const summary: GpuSummary = {
        paidUsd: 0,
        questUsd: 0,
        rentUsd: 0,
        paidRentUsd: 0,
        creditRentUsd: 0,
        retainedUsd: 0,
        cashMarginUsd: 0,
        cashMarginPct: null,
        marginUsd: 0,
        marginPct: null,
        flaggedRows: 0,
        mixedRows: 0,
    };
    for (const row of rows) {
        summary.paidUsd += row.paidUsd;
        summary.questUsd += row.questUsd;
        summary.rentUsd += row.rentUsd;
        summary.paidRentUsd += row.paidRentUsd;
        summary.creditRentUsd += row.creditRentUsd;
        summary.retainedUsd += row.retainedUsd;
        if (row.flags.length > 0) summary.flaggedRows += 1;
        if (row.flags.includes("mixed mode · Pollen unallocated")) {
            summary.mixedRows += 1;
        }
    }
    summary.cashMarginUsd = summary.retainedUsd - summary.paidRentUsd;
    summary.cashMarginPct =
        summary.retainedUsd > 0
            ? (summary.cashMarginUsd / summary.retainedUsd) * 100
            : null;
    summary.marginUsd = summary.retainedUsd - summary.rentUsd;
    summary.marginPct =
        summary.retainedUsd > 0
            ? (summary.marginUsd / summary.retainedUsd) * 100
            : null;
    return summary;
}

function marginTone(value: number) {
    if (value > 0) return "pos";
    if (value < 0) return "neg";
    return "base";
}

export function GpuTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const rows = useMemo(
        () => visibleGpuRows(gpuEconomics(data, month), vendor),
        [data, month, vendor],
    );
    const stats = useMemo(() => gpuSummary(rows), [rows]);
    const sortColumns = useMemo<SortColumn<GpuEconomicsRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "models", value: (row) => row.models },
            { key: "paidRentUsd", value: (row) => row.paidRentUsd },
            {
                key: "fundingMix",
                value: (row) =>
                    row.rentUsd > 0 ? row.paidRentUsd / row.rentUsd : null,
            },
            { key: "creditRentUsd", value: (row) => row.creditRentUsd },
            { key: "rentUsd", value: (row) => row.rentUsd },
            {
                key: "demandCoveragePct",
                value: (row) =>
                    demandCoveragePct(row.paidUsd + row.questUsd, row.rentUsd),
            },
            { key: "requests", value: (row) => row.requests },
            { key: "paidUsd", value: (row) => row.paidUsd },
            {
                key: "mix",
                value: (row) => {
                    const total = row.paidUsd + row.questUsd;
                    return total > 0 ? row.paidUsd / total : null;
                },
            },
            { key: "questUsd", value: (row) => row.questUsd },
            { key: "retainedUsd", value: (row) => row.retainedUsd },
            { key: "cashMarginPct", value: (row) => row.cashMarginPct },
            { key: "cashMarginUsd", value: (row) => row.cashMarginUsd },
            { key: "marginPct", value: (row) => row.marginPct },
            { key: "marginUsd", value: (row) => row.marginUsd },
            { key: "effUsdPerReq", value: (row) => row.effUsdPerReq },
            {
                key: "breakEven",
                value: (row) => row.breakEven[0]?.volume ?? null,
            },
            { key: "flags", value: (row) => row.flags.join(", ") },
        ],
        [],
    );
    const { headerProps, rows: sorted } = useSortableRows(rows, sortColumns);

    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "Pollen demand",
                        value: fmtUsd(stats.paidUsd + stats.questUsd),
                        detail: (
                            <GaugeSummary
                                left={stats.paidUsd}
                                leftLabel="Paid"
                                right={stats.questUsd}
                                rightLabel="Quest"
                            />
                        ),
                    },
                    {
                        label: "GPU funding",
                        value: fmtUsd(stats.rentUsd),
                        detail: (
                            <GaugeSummary
                                left={stats.paidRentUsd}
                                leftLabel="cash"
                                palette="neutral"
                                right={stats.creditRentUsd}
                                rightLabel="credit"
                            />
                        ),
                    },
                    {
                        label: "Retained Paid",
                        value: fmtUsd(stats.retainedUsd),
                        detail: "after ecosystem shares",
                    },
                    {
                        label: "Cash margin",
                        value: fmtUsd(stats.cashMarginUsd),
                        tone: marginTone(stats.cashMarginUsd),
                        detail: `${fmtMarginPct(stats.cashMarginPct)} · with credits`,
                    },
                    {
                        label: "Margin without credits",
                        value: fmtUsd(stats.marginUsd),
                        tone: marginTone(stats.marginUsd),
                        detail: `${fmtMarginPct(stats.marginPct)} · ${stats.flaggedRows} flagged`,
                    },
                ]}
            />
            {stats.mixedRows > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <Chip intent="warning" size="sm">
                        {stats.mixedRows} mixed month
                        {stats.mixedRows === 1 ? "" : "s"} unallocated
                    </Chip>
                </div>
            )}
            <TableScroller>
                <DataTable className="min-w-[2100px]">
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
                                {...headerProps("models")}
                            >
                                Models
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
                                GPU funding
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("demandCoveragePct")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "How much visible Pollen demand the GPU cost supported. This is an economics coverage ratio, not provider reconciliation.",
                                        formula:
                                            "(Pollen Paid + Quest) ÷ GPU total cost",
                                    }}
                                >
                                    Demand / cost
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                With credits
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={2}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Without credits
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={3}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Efficiency
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                className={GROUP_BORDER}
                                {...headerProps("flags")}
                            >
                                Flags
                            </TableHeaderCell>
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("paidUsd")}
                            >
                                Paid
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("mix")}
                            >
                                <HeaderHint hint="Usage mix — amber is Paid Pollen and green is Quest Pollen, using the shared wallet colors.">
                                    Paid / Quest
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="left"
                                {...headerProps("questUsd")}
                            >
                                Quest
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("retainedUsd")}
                            >
                                <HeaderHint hint="Paid Pollen retained after BYOP shares. Community models are reported separately.">
                                    Retained
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("paidRentUsd")}
                            >
                                Cash
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("fundingMix")}
                            >
                                <HeaderHint hint="GPU funding mix — strong neutral is real cash and muted neutral is consumed provider credit.">
                                    Cash / Credit
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="left"
                                {...headerProps("creditRentUsd")}
                            >
                                Credit
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("rentUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "GPU cost before credits reduce the cash bill.",
                                        formula: "cash + consumed credit",
                                        tables: "op_cloud_api",
                                        sources: "API/CLI/BQ/HC",
                                    }}
                                >
                                    Total
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("cashMarginPct")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "GPU cash margin after provider credits.",
                                        formula:
                                            "(retained paid − GPU cash) ÷ retained paid",
                                    }}
                                >
                                    Margin %
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("cashMarginUsd")}
                            >
                                Margin
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("marginPct")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "GPU margin if provider credits ended.",
                                        formula:
                                            "(retained paid − total GPU cost) ÷ retained paid",
                                    }}
                                >
                                    Margin %
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("marginUsd")}
                            >
                                Margin
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("requests")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Paid plus Quest requests matched by provider and month.",
                                        tables: "op_pollen_api",
                                        sources: "TB",
                                    }}
                                >
                                    Requests
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("effUsdPerReq")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Total GPU cost divided by paid plus Quest requests.",
                                        formula: "GPU total ÷ requests",
                                    }}
                                >
                                    $ / req
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="left"
                                {...headerProps("breakEven")}
                            >
                                Break-even
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            sorted,
                            (row) => `${row.month}|${row.vendor}`,
                        ).map(({ key, row }) => {
                            const pollenUsageUsd = row.paidUsd + row.questUsd;
                            const coveragePct = demandCoveragePct(
                                pollenUsageUsd,
                                row.rentUsd,
                            );
                            return (
                                <TableRow key={key}>
                                    <TableCell>
                                        {monthLabel(row.month)}
                                    </TableCell>
                                    <TableCell>{row.vendor}</TableCell>
                                    <TableCell>{row.models}</TableCell>
                                    <TableCell
                                        align="right"
                                        className={GROUP_BORDER}
                                    >
                                        {fmtUsd(row.paidUsd)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center">
                                            <Gauge
                                                left={row.paidUsd}
                                                leftLabel="Paid"
                                                right={row.questUsd}
                                                rightLabel="Quest"
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell align="left">
                                        {fmtUsd(row.questUsd)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {fmtUsd(row.retainedUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={GROUP_BORDER}
                                    >
                                        {fmtUsd(row.paidRentUsd)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center">
                                            <Gauge
                                                left={row.paidRentUsd}
                                                leftLabel="cash"
                                                palette="neutral"
                                                right={row.creditRentUsd}
                                                rightLabel="credit"
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell align="left">
                                        {fmtUsd(row.creditRentUsd)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {fmtUsd(row.rentUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={GROUP_BORDER}
                                    >
                                        <Tooltip
                                            triggerAs="span"
                                            content={
                                                <span className="block max-w-72">
                                                    Pollen usage{" "}
                                                    {fmtUsd(pollenUsageUsd)} ·
                                                    GPU rent{" "}
                                                    {fmtUsd(row.rentUsd)} ·
                                                    delta{" "}
                                                    {fmtUsd(
                                                        row.rentUsd -
                                                            pollenUsageUsd,
                                                    )}
                                                </span>
                                            }
                                        >
                                            <span>
                                                {fmtUnsignedPct(coveragePct)}
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={cn(
                                            GROUP_BORDER,
                                            signedToneOrSoft(row.cashMarginPct),
                                        )}
                                    >
                                        {fmtMarginPct(row.cashMarginPct)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={signedToneOrSoft(
                                            row.cashMarginUsd,
                                        )}
                                    >
                                        {fmtUsd(row.cashMarginUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={cn(
                                            signedToneOrSoft(row.marginPct),
                                            GROUP_BORDER,
                                        )}
                                    >
                                        {fmtMarginPct(row.marginPct)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={signedToneOrSoft(
                                            row.marginUsd,
                                        )}
                                    >
                                        {fmtUsd(row.marginUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={GROUP_BORDER}
                                    >
                                        {fmtNumber(row.requests)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {fmtUsd4(row.effUsdPerReq)}
                                    </TableCell>
                                    <TableCell>
                                        {row.breakEven.length === 0 ? (
                                            <span className="text-theme-text-soft">
                                                -
                                            </span>
                                        ) : (
                                            <div className="flex flex-col gap-0.5">
                                                {row.breakEven.map((item) => (
                                                    <span key={item.model}>
                                                        {fmtNumber(item.volume)}{" "}
                                                        {item.unit}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className={GROUP_BORDER}>
                                        {row.flags.length === 0 ? (
                                            <span className="text-theme-text-soft">
                                                -
                                            </span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {row.flags.map((flag) => (
                                                    <Chip
                                                        key={flag}
                                                        intent="warning"
                                                        size="sm"
                                                    >
                                                        {flag}
                                                    </Chip>
                                                ))}
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {sorted.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={20}
                                    className="py-8 text-center text-theme-text-soft"
                                >
                                    No GPU economics for this selection.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
