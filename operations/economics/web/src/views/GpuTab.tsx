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
import { Gauge, usageMatchPct } from "../components/EconTable";
import { StatCards } from "../components/StatCards";
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
    type ValueFilter,
    WINDOW_START,
} from "../lib/months";
import { signedToneOrSoft, usageMatchTone } from "../lib/tone";
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
    creditRentUsd: number;
    retainedUsd: number;
    marginUsd: number;
    marginPct: number | null;
    flaggedRows: number;
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

// GPU rent is attributed at vendor+month grain, not per-pod or per-model:
// generation_event_v2's provider field is real per-request ground truth, but a
// pod's manually-entered "model" label isn't (one host can run several
// models at once), so splitting rent across models would just be a guess
// dressed up as precision. This is still biased when a vendor's Pollen
// traffic includes usage not actually served by the GPU we rent from them —
// accepted for now; fixing that needs real per-request GPU tagging.
export function gpuEconomics(data: Data, monthFilter: MonthFilterValue) {
    type Acc = GpuEconomicsRow & {
        modelSet: Set<string>;
    };
    const groups = new Map<string, Acc>();

    for (const row of data.opCloud ?? []) {
        if (row.type !== "gpu") continue;
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
            pollen.month < WINDOW_START ||
            !matchesMonth(pollen.month, monthFilter)
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
            if (models.length === 0) flags.push("missing model");
            if (models.length > 0 && row.requests <= 0) {
                flags.push("no Pollen match");
            }
            const marginUsd = row.retainedUsd - row.rentUsd;
            return {
                ...row,
                models: models.join(", "),
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
        creditRentUsd: 0,
        retainedUsd: 0,
        marginUsd: 0,
        marginPct: null,
        flaggedRows: 0,
    };
    for (const row of rows) {
        summary.paidUsd += row.paidUsd;
        summary.questUsd += row.questUsd;
        summary.rentUsd += row.rentUsd;
        summary.creditRentUsd += row.creditRentUsd;
        summary.retainedUsd += row.retainedUsd;
        if (row.flags.length > 0) summary.flaggedRows += 1;
    }
    summary.marginUsd = summary.retainedUsd - summary.rentUsd;
    summary.marginPct =
        summary.retainedUsd > 0
            ? (summary.marginUsd / summary.retainedUsd) * 100
            : null;
    return summary;
}

function marginTone(value: number) {
    return value >= 0 ? "pos" : "neg";
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
            { key: "vendor", value: (row) => row.vendor },
            { key: "models", value: (row) => row.models },
            { key: "rentUsd", value: (row) => row.rentUsd },
            {
                key: "usageMatchPct",
                value: (row) =>
                    usageMatchPct(row.paidUsd + row.questUsd, row.rentUsd),
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
            { key: "marginPct", value: (row) => row.marginPct },
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
                        label: "Paid Pollen",
                        value: fmtUsd(stats.paidUsd),
                        detail: (
                            <Gauge
                                paid={stats.paidUsd}
                                quests={stats.questUsd}
                            />
                        ),
                    },
                    {
                        label: "GPU Rent",
                        value: fmtUsd(stats.rentUsd),
                        detail:
                            stats.rentUsd > 0
                                ? `${fmtUnsignedPct((stats.creditRentUsd / stats.rentUsd) * 100)} credit-funded`
                                : "Cloud OP GPU burn",
                    },
                    {
                        label: "GPU Margin",
                        value: fmtUsd(stats.marginUsd),
                        tone: marginTone(stats.marginUsd),
                        detail:
                            stats.flaggedRows > 0
                                ? `${stats.flaggedRows} flagged`
                                : "all mapped",
                    },
                    {
                        label: "GPU Margin %",
                        value: fmtMarginPct(stats.marginPct),
                        tone: marginTone(stats.marginPct ?? stats.marginUsd),
                        detail: "margin ÷ retained",
                    },
                    {
                        label: "Quest",
                        value: fmtUsd(stats.questUsd),
                        detail: "free-tier demand",
                    },
                ]}
            />
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("vendor")}
                            >
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("models")}
                            >
                                models
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={1}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Cloud
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("usageMatchPct")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Reconciliation between cloud GPU rent and visible Pollen usage.",
                                        formula:
                                            "min(Pollen Paid + Quest, GPU Rent) ÷ max(Pollen Paid + Quest, GPU Rent)",
                                    }}
                                >
                                    Match %
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={4}
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
                                Economics
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
                                {...headerProps("rentUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Cloud OP GPU burn: paid burn plus credit burn. Positive credit-received rows are excluded.",
                                        tables: "op_cloud_api",
                                        sources: "API/CLI/BQ/HC",
                                    }}
                                >
                                    Rent
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("requests")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Paid plus quest requests from OP Pollen, matched by vendor and month.",
                                        tables: "op_pollen_api",
                                        sources: "TB",
                                    }}
                                >
                                    Req
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("paidUsd")}
                            >
                                Paid
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="center"
                                {...headerProps("mix")}
                            >
                                Paid / Quest
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="left"
                                {...headerProps("questUsd")}
                            >
                                Quest
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("marginPct")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "GPU margin as a percentage of retained paid Pollen. Quest is demand, not revenue.",
                                        formula:
                                            "(retained paid − rent) ÷ retained paid",
                                    }}
                                >
                                    Margin %
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("effUsdPerReq")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "GPU rent divided by paid plus quest requests.",
                                        formula: "rent ÷ requests",
                                    }}
                                >
                                    Eff $/req
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
                            const matchPct = usageMatchPct(
                                pollenUsageUsd,
                                row.rentUsd,
                            );
                            return (
                                <TableRow key={key}>
                                    <TableCell>{row.vendor}</TableCell>
                                    <TableCell>{row.models}</TableCell>
                                    <TableCell
                                        align="right"
                                        className={GROUP_BORDER}
                                    >
                                        {fmtUsd(row.rentUsd)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={cn(
                                            GROUP_BORDER,
                                            usageMatchTone(matchPct),
                                        )}
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
                                                {fmtUnsignedPct(matchPct)}
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={GROUP_BORDER}
                                    >
                                        {fmtNumber(row.requests)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className="text-intent-success-text"
                                    >
                                        {fmtUsd(row.paidUsd)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center">
                                            <Gauge
                                                paid={row.paidUsd}
                                                quests={row.questUsd}
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-left text-intent-warning-text">
                                        {fmtUsd(row.questUsd)}
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
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
