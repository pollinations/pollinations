import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { fmtMultiplier, fmtUsd } from "../lib/format";
import {
    breakEvenMultiplier,
    ecosystemTotals,
    globalNetRatio,
    type ModelEconomics,
    modelEconomics,
} from "../lib/insights";
import { monthLabel } from "../lib/months";
import type { Data } from "../types";

export function visibleModelRows(rows: ModelEconomics[], vendor: string) {
    return rows.filter((row) => vendor === "all" || row.vendor === vendor);
}

export function gaugeParts(paid: number, quests: number, maxTotal: number) {
    const total = paid + quests;
    if (total <= 0 || maxTotal <= 0) return null;
    return {
        widthPct: (total / maxTotal) * 100,
        paidPct: (paid / total) * 100,
        questsPct: (quests / total) * 100,
    };
}

// Right-anchored: the bar grows leftwards with total pollen, so scanning
// the column reads volume at a glance; the color split is the meter mix.
function PollenGauge({
    max,
    paid,
    quests,
}: {
    max: number;
    paid: number;
    quests: number;
}) {
    const parts = gaugeParts(paid, quests, max);
    if (!parts) return <span>–</span>;
    const label = `paid ${parts.paidPct.toFixed(0)}% · quests ${parts.questsPct.toFixed(0)}% · total ${fmtUsd(paid + quests)}`;
    return (
        <div
            className="flex h-2.5 w-36 justify-end overflow-hidden rounded-sm bg-theme-bg-active"
            role="img"
            aria-label={label}
            title={label}
        >
            <div
                className="flex h-full justify-end"
                style={{ width: `${parts.widthPct}%` }}
            >
                <div
                    className="h-full bg-intent-success-text/70"
                    style={{ width: `${parts.paidPct}%` }}
                />
                <div
                    className="h-full bg-theme-text-soft/40"
                    style={{ width: `${parts.questsPct}%` }}
                />
            </div>
        </div>
    );
}

function marginTone(value: number) {
    return value >= 0 ? "text-intent-success-text" : "text-intent-danger-text";
}

export function ModelsTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const netRatio = useMemo(
        () => globalNetRatio(data.revenueMonthly),
        [data.revenueMonthly],
    );
    const breakEven = useMemo(() => breakEvenMultiplier(netRatio), [netRatio]);
    const ecosystem = useMemo(
        () => ecosystemTotals(data.usageMonthly, month),
        [data.usageMonthly, month],
    );
    const allRows = useMemo(
        () => modelEconomics(data, month, netRatio),
        [data, month, netRatio],
    );
    const baseRows = useMemo(
        () => visibleModelRows(allRows, vendor),
        [allRows, vendor],
    );
    const maxTotalPollen = useMemo(
        () =>
            baseRows.reduce(
                (max, row) =>
                    Math.max(max, row.grossPaidUsd + row.grossQuestsUsd),
                0,
            ),
        [baseRows],
    );
    const sortColumns = useMemo<SortColumn<ModelEconomics>[]>(
        () => [
            { key: "vendor", value: (row) => row.vendor },
            { key: "model", value: (row) => row.model },
            { key: "grossPaidUsd", value: (row) => row.grossPaidUsd },
            { key: "ecoPaidUsd", value: (row) => row.ecoPaidUsd },
            { key: "retainedPaidUsd", value: (row) => row.retainedPaidUsd },
            { key: "grossQuestsUsd", value: (row) => row.grossQuestsUsd },
            {
                key: "paid_share",
                value: (row) => {
                    const total = row.grossPaidUsd + row.grossQuestsUsd;
                    return total > 0 ? row.grossPaidUsd / total : null;
                },
            },
            { key: "registeredCostUsd", value: (row) => row.registeredCostUsd },
            { key: "sharePct", value: (row) => row.sharePct },
            { key: "trueCostUsd", value: (row) => row.trueCostUsd },
            { key: "basis", value: (row) => row.basis },
            {
                key: "effectiveMultiplier",
                value: (row) => row.effectiveMultiplier,
            },
            { key: "marginUsd", value: (row) => row.marginUsd },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "marginUsd",
        direction: "asc",
    });

    const scopeLabel = month === "" ? "all data" : monthLabel(month);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Chip size="sm">
                    net ratio{" "}
                    {netRatio == null ? "–" : `${(netRatio * 100).toFixed(0)}%`}
                </Chip>
                <Chip size="sm">break-even {fmtMultiplier(breakEven)}</Chip>
                <Chip size="sm">
                    ecosystem {fmtUsd(ecosystem.byopUsd + ecosystem.modelUsd)}{" "}
                    (byop {fmtUsd(ecosystem.byopUsd)} · model{" "}
                    {fmtUsd(ecosystem.modelUsd)})
                </Chip>
                <Chip size="sm">scope: {scopeLabel}</Chip>
            </div>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("vendor")}>
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("model")}>
                                model
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("grossPaidUsd")}>
                                gross_paid
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("ecoPaidUsd")}>
                                eco_paid
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("retainedPaidUsd")}
                            >
                                retained_paid
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("grossQuestsUsd")}>
                                gross_quests
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("paid_share")}>
                                paid / quests
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("registeredCostUsd")}
                            >
                                registered
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("sharePct")}>
                                share
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("trueCostUsd")}>
                                true cost
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("basis")}>
                                basis
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("effectiveMultiplier")}
                            >
                                eff ×
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("marginUsd")}>
                                margin
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.vendor}|${row.model}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{row.model}</TableCell>
                                <TableCell>
                                    {fmtUsd(row.grossPaidUsd)}
                                </TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {fmtUsd(row.ecoPaidUsd)}
                                </TableCell>
                                <TableCell>
                                    {fmtUsd(row.retainedPaidUsd)}
                                </TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {fmtUsd(row.grossQuestsUsd)}
                                </TableCell>
                                <TableCell>
                                    <PollenGauge
                                        paid={row.grossPaidUsd}
                                        quests={row.grossQuestsUsd}
                                        max={maxTotalPollen}
                                    />
                                </TableCell>
                                <TableCell>
                                    {fmtUsd(row.registeredCostUsd)}
                                </TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {row.sharePct.toFixed(1)}%
                                </TableCell>
                                <TableCell>{fmtUsd(row.trueCostUsd)}</TableCell>
                                <TableCell>
                                    <Chip size="sm">
                                        {row.basis === "registered"
                                            ? "reg"
                                            : row.basis}
                                    </Chip>
                                </TableCell>
                                <TableCell>
                                    {fmtMultiplier(row.effectiveMultiplier)}
                                </TableCell>
                                <TableCell
                                    className={marginTone(row.marginUsd)}
                                >
                                    {fmtUsd(row.marginUsd)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
            <Text size="micro" tone="soft">
                margin = retained_paid × net-ratio − true cost · retained_paid =
                gross_paid − byop_paid − model_paid · eco_paid = byop_paid +
                model_paid · paid / quests gauge: bar length = total pollen vs
                the biggest model in view, colored = paid, faded = quests · true
                cost = vendor actual × model share of registered cost · basis:
                meter = vendor-reported, cash = bank, reg = our metering (no
                vendor data yet) · sorted worst margin first
            </Text>
        </div>
    );
}
