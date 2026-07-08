import { useMemo } from "react";
import {
    EconTable,
    Gauge,
    hasEconActivity,
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
        () =>
            visibleEconRows(economics(data, month, "model"), vendor).filter(
                hasEconActivity,
            ),
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
                        label: "Paid",
                        value: fmtUsd(stats.soldPaidUsd),
                        detail: (
                            <Gauge
                                paid={stats.soldPaidUsd}
                                quests={stats.soldQuestsUsd}
                            />
                        ),
                    },
                    {
                        label: "Provider Cost",
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
                        label: "Coverage ×",
                        value: fmtMultiplier(stats.trueMultiplier),
                        tone: trueXStatTone(
                            stats.trueMultiplier,
                            cashBreakEven,
                        ),
                        detail: "retained ÷ Provider Cost",
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
