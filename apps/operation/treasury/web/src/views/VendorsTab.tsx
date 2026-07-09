import { useMemo } from "react";
import {
    EconTable,
    Gauge,
    trueXStatTone,
    visibleEconRows,
} from "../components/EconTable";
import { StatCards } from "../components/StatCards";
import { fmtMultiplier, fmtUnsignedPct, fmtUsd } from "../lib/format";
import { econSummary, providerEconomics } from "../lib/insights";
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
    const econRows = useMemo(
        () => visibleEconRows(providerEconomics(data, month), vendor),
        [data, month, vendor],
    );
    const stats = useMemo(() => econSummary(econRows), [econRows]);

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
                        label: "Costs",
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
                        tone: trueXStatTone(stats.trueMultiplier, null),
                        detail: "retained ÷ costs",
                    },
                    {
                        label: "Quests",
                        value: fmtUsd(stats.questBurnUsd),
                        detail: "free-tier subsidy",
                    },
                ]}
            />
            <EconTable netRatio={null} rows={econRows} sourceMode="op" />
        </div>
    );
}
