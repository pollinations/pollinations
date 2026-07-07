import { useMemo } from "react";
import {
    EconTable,
    Gauge,
    trueXStatTone,
    visibleEconRows,
} from "../components/EconTable";
import { StatCards } from "../components/StatCards";
import { fmtMultiplier, fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    breakEvenMultiplier,
    economics,
    econSummary,
    globalNetRatio,
} from "../lib/insights";
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
    const rows = useMemo(
        () => visibleEconRows(economics(data, month, "model"), vendor),
        [data, month, vendor],
    );
    const stats = useMemo(() => econSummary(rows), [rows]);
    const cashBreakEven = breakEvenMultiplier(netRatio);
    const worst = stats.mostUnderpriced;

    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "Sold (paid)",
                        value: fmtUsd(stats.soldPaidUsd),
                        detail: (
                            <Gauge
                                paid={stats.soldPaidUsd}
                                quests={stats.soldQuestsUsd}
                            />
                        ),
                    },
                    {
                        label: "True cost",
                        value: fmtUsd(stats.trueCostPaidUsd),
                        detail:
                            stats.creditFundedPct != null
                                ? `${fmtUnsignedPct(stats.creditFundedPct)} credit-funded`
                                : "provider actual",
                    },
                    {
                        label: "Margin",
                        value: fmtUsd(stats.marginUsd),
                        tone: stats.marginUsd >= 0 ? "pos" : "neg",
                        detail:
                            stats.underwaterCount > 0
                                ? `${stats.underwaterCount} underwater`
                                : "all profitable",
                    },
                    {
                        label: "Blended true ×",
                        value: fmtMultiplier(stats.trueMultiplier),
                        tone: trueXStatTone(
                            stats.trueMultiplier,
                            cashBreakEven,
                        ),
                        detail: "retained ÷ true cost",
                    },
                    {
                        label: "Most underpriced",
                        value: (
                            <span className="text-xl leading-tight">
                                {worst?.model ?? "–"}
                            </span>
                        ),
                        tone: worst ? "neg" : "base",
                        detail: worst
                            ? `${fmtMultiplier(worst.trueMultiplier)} · ${fmtUsd(worst.marginUsd)}`
                            : "all profitable",
                    },
                ]}
            />
            <EconTable netRatio={netRatio} rows={rows} showModel />
        </div>
    );
}
