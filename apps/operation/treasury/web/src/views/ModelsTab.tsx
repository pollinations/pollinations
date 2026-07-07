import { Chip } from "@pollinations/ui";
import { useMemo } from "react";
import { EconTable, visibleEconRows } from "../components/EconTable";
import { fmtMultiplier, fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    breakEvenMultiplier,
    economics,
    ecosystemTotals,
    globalNetRatio,
} from "../lib/insights";
import { monthLabel } from "../lib/months";
import type { Data } from "../types";

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
    const cashBreakEven = useMemo(
        () => breakEvenMultiplier(netRatio),
        [netRatio],
    );
    const ecosystem = useMemo(
        () => ecosystemTotals(data.pollenMonthly, month),
        [data.pollenMonthly, month],
    );
    const rows = useMemo(
        () => visibleEconRows(economics(data, month, "model"), vendor),
        [data, month, vendor],
    );

    const scopeLabel = month === "" ? "all data" : monthLabel(month);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    compute break-even 1.00×
                </Chip>
                <Chip data-theme="neutral" intent="neutral" size="sm">
                    cash break-even {fmtMultiplier(cashBreakEven)} (net ratio{" "}
                    {netRatio == null ? "–" : fmtUnsignedPct(netRatio * 100)})
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
            <EconTable netRatio={netRatio} rows={rows} showModel />
        </div>
    );
}
