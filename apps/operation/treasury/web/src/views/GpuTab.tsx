import {
    Chip,
    cn,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
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
import { Gauge, trueXStatTone } from "../components/EconTable";
import { StatCards } from "../components/StatCards";
import {
    fmtMultiplier,
    fmtNumber,
    fmtUnsignedPct,
    fmtUsd,
    fmtUsd4,
} from "../lib/format";
import { toUsd } from "../lib/fx";
import { matchesMonth, WINDOW_START } from "../lib/months";
import type { Data, OpCloudRow } from "../types";

const REGISTRY_UNIT_PRICES: Record<string, { price: number; unit: string }> = {
    zimage: { price: 0.002, unit: "img" },
    klein: { price: 0.01, unit: "img" },
    "ltx-2": { price: 0.005, unit: "s" },
};

export type GpuEconomicsRow = {
    gpu: string;
    vendor: string;
    model: string;
    month: string;
    rentUsd: number;
    paidRentUsd: number;
    creditRentUsd: number;
    requests: number;
    paidUsd: number;
    questUsd: number;
    retainedUsd: number;
    coverage: number | null;
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
    coverage: number | null;
    flaggedRows: number;
};

function splitModels(model: string): string[] {
    return model
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
}

function opCloudMonth(row: Pick<OpCloudRow, "start">): string {
    return row.start.slice(0, 7);
}

function opCloudPaidBurnUsd(row: OpCloudRow): number {
    return Math.max(0, -toUsd(row.paid, row.currency, row.start));
}

function opCloudCreditBurnUsd(row: OpCloudRow): number {
    return Math.max(0, -toUsd(row.credit, row.currency, row.start));
}

function modelKey(model: string): string {
    return model.trim() || "missing model";
}

function gpuKey(gpu: string): string {
    return gpu.trim() || "unknown GPU";
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

export function gpuEconomics(data: Data, monthFilter: string) {
    type Acc = GpuEconomicsRow & {
        modelSet: Set<string>;
        rawModel: string;
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
        if (rentUsd <= 0) continue;

        const gpu = gpuKey(row.resource_sku);
        const model = modelKey(row.model);
        const key = `${month}|${row.vendor}|${gpu}|${model}`;
        const acc = groups.get(key) ?? {
            gpu,
            vendor: row.vendor,
            model,
            month,
            rentUsd: 0,
            paidRentUsd: 0,
            creditRentUsd: 0,
            requests: 0,
            paidUsd: 0,
            questUsd: 0,
            retainedUsd: 0,
            coverage: null,
            effUsdPerReq: null,
            breakEven: [],
            flags: [],
            modelSet: new Set(splitModels(row.model)),
            rawModel: row.model,
        };
        acc.rentUsd += rentUsd;
        acc.paidRentUsd += paidRentUsd;
        acc.creditRentUsd += creditRentUsd;
        for (const modelName of splitModels(row.model)) {
            acc.modelSet.add(modelName);
        }
        groups.set(key, acc);
    }

    const groupsByVendorMonthModel = new Map<string, Acc[]>();
    for (const group of groups.values()) {
        for (const model of group.modelSet) {
            const key = `${group.month}|${group.vendor}|${model}`;
            const entries = groupsByVendorMonthModel.get(key) ?? [];
            entries.push(group);
            groupsByVendorMonthModel.set(key, entries);
        }
    }

    for (const pollen of data.opPollen ?? []) {
        if (
            pollen.month < WINDOW_START ||
            !matchesMonth(pollen.month, monthFilter)
        ) {
            continue;
        }
        const candidates =
            groupsByVendorMonthModel.get(
                `${pollen.month}|${pollen.vendor}|${pollen.model}`,
            ) ?? [];
        if (candidates.length === 0) continue;

        const totalRent = candidates.reduce((sum, row) => sum + row.rentUsd, 0);
        for (const row of candidates) {
            const share =
                totalRent > 0 ? row.rentUsd / totalRent : 1 / candidates.length;
            row.requests +=
                (pollen.requests_paid + pollen.requests_quests) * share;
            row.paidUsd +=
                toUsd(pollen.price_paid, pollen.currency, pollen.month) * share;
            row.questUsd +=
                toUsd(pollen.price_quests, pollen.currency, pollen.month) *
                share;
            row.retainedUsd +=
                toUsd(
                    pollen.price_paid - pollen.byop_paid - pollen.model_paid,
                    pollen.currency,
                    pollen.month,
                ) * share;
        }
    }

    return [...groups.values()]
        .map((row): GpuEconomicsRow => {
            const models = [...row.modelSet].sort();
            const flags: string[] = [];
            if (row.gpu === "unknown GPU") flags.push("unknown GPU");
            if (row.model === "missing model") flags.push("missing model");
            if (models.length > 0 && row.requests <= 0) {
                flags.push("no Pollen match");
            }
            return {
                ...row,
                coverage:
                    row.rentUsd > 0 ? row.retainedUsd / row.rentUsd : null,
                effUsdPerReq:
                    row.requests > 0 ? row.rentUsd / row.requests : null,
                breakEven: computeBreakEven(models, row.rentUsd),
                flags,
            };
        })
        .sort((a, b) => {
            if (a.coverage == null && b.coverage == null) {
                return b.rentUsd - a.rentUsd;
            }
            if (a.coverage == null) return 1;
            if (b.coverage == null) return -1;
            return a.coverage - b.coverage || b.rentUsd - a.rentUsd;
        });
}

export function visibleGpuRows(rows: GpuEconomicsRow[], vendor: string) {
    return rows.filter((row) => vendor === "all" || row.vendor === vendor);
}

export function gpuSummary(rows: GpuEconomicsRow[]): GpuSummary {
    const summary: GpuSummary = {
        paidUsd: 0,
        questUsd: 0,
        rentUsd: 0,
        creditRentUsd: 0,
        retainedUsd: 0,
        marginUsd: 0,
        coverage: null,
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
    summary.coverage =
        summary.rentUsd > 0 ? summary.retainedUsd / summary.rentUsd : null;
    return summary;
}

function rowCoverageTone(value: number | null) {
    if (value == null) return "text-theme-text-soft";
    if (value < 1) return "text-intent-danger-text";
    return "text-intent-success-text";
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
    month?: string;
    vendor?: string;
}) {
    const rows = useMemo(
        () => visibleGpuRows(gpuEconomics(data, month), vendor),
        [data, month, vendor],
    );
    const stats = useMemo(() => gpuSummary(rows), [rows]);
    const sortColumns = useMemo<SortColumn<GpuEconomicsRow>[]>(
        () => [
            { key: "gpu", value: (row) => row.gpu },
            { key: "vendor", value: (row) => row.vendor },
            { key: "model", value: (row) => row.model },
            { key: "rentUsd", value: (row) => row.rentUsd },
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
            { key: "coverage", value: (row) => row.coverage },
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
                        label: "Paid",
                        value: fmtUsd(stats.paidUsd),
                        detail: (
                            <Gauge
                                paid={stats.paidUsd}
                                quests={stats.questUsd}
                            />
                        ),
                    },
                    {
                        label: "Rent",
                        value: fmtUsd(stats.rentUsd),
                        detail:
                            stats.rentUsd > 0
                                ? `${fmtUnsignedPct((stats.creditRentUsd / stats.rentUsd) * 100)} credit-funded`
                                : "Cloud OP GPU burn",
                    },
                    {
                        label: "Margin",
                        value: fmtUsd(stats.marginUsd),
                        tone: marginTone(stats.marginUsd),
                        detail:
                            stats.flaggedRows > 0
                                ? `${stats.flaggedRows} flagged`
                                : "all mapped",
                    },
                    {
                        label: "Coverage ×",
                        value: fmtMultiplier(stats.coverage),
                        tone: trueXStatTone(stats.coverage, null),
                        detail: "retained ÷ rent",
                    },
                    {
                        label: "Quests",
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
                                {...headerProps("gpu")}
                            >
                                GPU
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("vendor")}
                            >
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("model")}
                            >
                                model
                            </TableHeaderCell>
                            <TableHeaderCell
                                colSpan={1}
                                align="center"
                                className={GROUP_BORDER}
                            >
                                Cloud
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
                                            "Cloud OP GPU burn: paid burn plus credit burn. Positive grant-received rows are excluded.",
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
                                            "Paid plus quest requests from OP Pollen, matched by vendor, month, and model.",
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
                                Paid / Quests
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="left"
                                {...headerProps("questUsd")}
                            >
                                Quests
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("coverage")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Retained paid Pollen divided by GPU rent. Quests are demand, not revenue.",
                                        formula: "retained paid ÷ rent",
                                    }}
                                >
                                    Coverage ×
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
                            (row) =>
                                `${row.month}|${row.vendor}|${row.gpu}|${row.model}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{row.gpu}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{row.model}</TableCell>
                                <TableCell
                                    align="right"
                                    className={GROUP_BORDER}
                                >
                                    {fmtUsd(row.rentUsd)}
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
                                        rowCoverageTone(row.coverage),
                                        GROUP_BORDER,
                                    )}
                                >
                                    {fmtMultiplier(row.coverage)}
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
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
