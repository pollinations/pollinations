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

export function VendorsTab({
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
    const econRows = useMemo(
        () => visibleEconRows(economics(data, month, "vendor"), vendor),
        [data, month, vendor],
    );
    const stats = useMemo(() => econSummary(econRows), [econRows]);
    const cashBreakEven = breakEvenMultiplier(netRatio);

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
                        label: "Quests",
                        value: fmtUsd(stats.questBurnUsd),
                        detail: "free-tier subsidy",
                    },
                ]}
            />
            <EconTable netRatio={netRatio} rows={econRows} showFlags />
        </div>
    );
}
