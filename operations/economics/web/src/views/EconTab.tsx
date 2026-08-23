import { useMemo } from "react";
import { EconTable, Gauge, visibleEconRows } from "../components/EconTable";
import { StatCards } from "../components/StatCards";
import { fmtMarginPct, fmtUnsignedPct, fmtUsd } from "../lib/format";
import {
    econSummary,
    modelEconomics,
    providerEconomics,
} from "../lib/insights";
import type { MonthFilterValue, ValueFilter } from "../lib/months";
import type { Data } from "../types";

// One view, two grains: Vendors is exactly Models rolled up (same columns,
// same math), so a single component keeps the two tabs from drifting apart.
export function EconTab({
    data,
    grain,
    month = "",
    vendor = "all",
}: {
    data: Data;
    grain: "vendor" | "model";
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const econRows = useMemo(() => {
        const rows =
            grain === "model"
                ? modelEconomics(data, month)
                : providerEconomics(data, month);
        return visibleEconRows(rows, vendor);
    }, [data, grain, month, vendor]);
    const stats = useMemo(() => econSummary(econRows), [econRows]);

    return (
        <div className="flex flex-col gap-4">
            <StatCards
                items={[
                    {
                        label: "Paid Pollen",
                        value: fmtUsd(stats.soldPaidUsd),
                        detail: (
                            <Gauge
                                paid={stats.soldPaidUsd}
                                quests={stats.soldQuestsUsd}
                            />
                        ),
                    },
                    {
                        label: "Provider Cash",
                        value: fmtUsd(stats.providerCashCostUsd),
                        tone: stats.unpricedCount > 0 ? "warn" : undefined,
                        detail:
                            stats.unpricedCount > 0
                                ? `${stats.unpricedCount} unpriced (no provider bill)`
                                : stats.providerGrantFundedUsd > 0
                                  ? `usage ${fmtUsd(stats.providerUsageUsd)}`
                                  : "cash",
                    },
                    {
                        label: "Provider Credit",
                        value: fmtUsd(stats.providerGrantFundedUsd),
                        detail:
                            stats.creditFundedPct != null
                                ? `${fmtUnsignedPct(stats.creditFundedPct)} of provider usage`
                                : "credit applied",
                    },
                    {
                        label: "Cash Margin",
                        value: fmtUsd(stats.cashMarginUsd),
                        tone: stats.cashMarginUsd >= 0 ? "pos" : "neg",
                        detail:
                            stats.underwaterCount > 0
                                ? `${stats.underwaterCount} underwater`
                                : "all profitable",
                    },
                    {
                        label: "Cash Margin %",
                        value: fmtMarginPct(stats.cashMarginPct),
                        tone: (stats.cashMarginPct ?? 0) >= 0 ? "pos" : "neg",
                        detail: "margin ÷ retained",
                    },
                    {
                        label: "Quest",
                        value: fmtUsd(stats.questBurnUsd),
                        detail: "free-tier usage",
                    },
                ]}
            />
            <EconTable rows={econRows} showModel={grain === "model"} />
        </div>
    );
}
