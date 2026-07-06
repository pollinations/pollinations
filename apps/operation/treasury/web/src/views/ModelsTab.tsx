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
    HeaderHint,
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
// the column reads volume at a glance; the color split is the paid/quests mix.
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
        () => ecosystemTotals(data.pollenMonthly, month),
        [data.pollenMonthly, month],
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
            { key: "pollenCostUsd", value: (row) => row.pollenCostUsd },
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
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    net ratio{" "}
                    {netRatio == null ? "–" : `${(netRatio * 100).toFixed(0)}%`}
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    break-even {fmtMultiplier(breakEven)}
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    ecosystem {fmtUsd(ecosystem.byopUsd + ecosystem.modelUsd)}{" "}
                    (byop {fmtUsd(ecosystem.byopUsd)} · model{" "}
                    {fmtUsd(ecosystem.modelUsd)})
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    scope: {scopeLabel}
                </Chip>
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
                                <HeaderHint hint="Pollen end users paid for this model (price_paid).">
                                    gross_paid
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("ecoPaidUsd")}>
                                <HeaderHint hint="Passed onward: byop_paid (app developer share) + model_paid (community model owner share).">
                                    eco_paid
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("retainedPaidUsd")}
                            >
                                <HeaderHint hint="gross_paid − eco_paid: the pollen Pollinations actually keeps.">
                                    retained_paid
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("grossQuestsUsd")}>
                                <HeaderHint hint="Free quest pollen consumed on this model - costs us, earns nothing (price_quests).">
                                    gross_quests
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("paid_share")}>
                                <HeaderHint hint="Bar length = total pollen vs the biggest model in view; colored = paid, faded = quests.">
                                    paid / quests
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("pollenCostUsd")}>
                                <HeaderHint hint="Our metered cost for this model: cost_paid + cost_quests.">
                                    pollen cost
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("sharePct")}>
                                <HeaderHint hint="This model's % of the vendor's total pollen cost - how vendor actuals get allocated to models.">
                                    share
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("trueCostUsd")}>
                                <HeaderHint hint="Vendor actual spend × share. The actual is picked by the basis waterfall.">
                                    true cost
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("basis")}>
                                <HeaderHint hint="Which witness supplied the vendor actual for true cost: provider (their meter) → transactions (bank cash) → pollen (our metering, no vendor data yet).">
                                    basis
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("effectiveMultiplier")}
                            >
                                <HeaderHint hint="gross_paid / cost_paid: the markup achieved on paid usage. Compare to the break-even chip.">
                                    eff ×
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("marginUsd")}>
                                <HeaderHint hint="retained_paid × net ratio − true cost: what this model actually earns or loses us.">
                                    margin
                                </HeaderHint>
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
                                    {fmtUsd(row.pollenCostUsd)}
                                </TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {row.sharePct.toFixed(1)}%
                                </TableCell>
                                <TableCell>{fmtUsd(row.trueCostUsd)}</TableCell>
                                <TableCell>
                                    <Chip
                                        data-theme="neutral"
                                        intent="neutral"
                                        size="sm"
                                    >
                                        {row.basis}
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
                model_paid · true cost = vendor actual × model share of pollen
                cost · basis names the witness that supplied the vendor actual:
                provider (their meter), transactions (bank cash), pollen (our
                metering, no vendor data yet) · sorted worst margin first
            </Text>
        </div>
    );
}
