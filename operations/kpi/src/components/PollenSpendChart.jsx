import { Text } from "@pollinations/ui";
import { useState } from "react";
import { POLLEN_CATEGORIES, pollenSpendSeries } from "../lib/kpis";
import { LineChart } from "./LineChart";

export function PollenSpendChart({ weeks }) {
    const [selected, setSelected] = useState("top");
    return (
        <LineChart
            title="Pollen spent by category"
            data={weeks}
            series={pollenSpendSeries(weeks, selected)}
            format="currency"
            action={
                <div className="flex flex-wrap items-center gap-3">
                    <Text tone="muted" size="xs">
                        Completed UTC weeks · Paid + Quest Pollen (USD)
                    </Text>
                    <select
                        aria-label="Pollen spend category"
                        value={selected}
                        onChange={(event) => setSelected(event.target.value)}
                        className="rounded-lg bg-theme-bg-subtle px-2.5 py-1.5 font-medium text-sm text-theme-text-strong hover:bg-theme-bg-hover"
                    >
                        <option value="top">Top 3 · last completed week</option>
                        {POLLEN_CATEGORIES.map(({ key, label }) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </select>
                </div>
            }
        />
    );
}
