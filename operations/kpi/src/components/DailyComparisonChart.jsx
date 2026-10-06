import { TabButton, Text } from "@pollinations/ui";
import { useState } from "react";
import { LineChart } from "./LineChart";

const SERIES = [
    {
        key: "currentRevenue",
        label: "Revenue · this week",
        format: "currency",
        color: "var(--kpi-series-1)",
    },
    {
        key: "previousRevenue",
        label: "Revenue · last week",
        format: "currency",
        color: "var(--kpi-series-1)",
        dashed: true,
    },
    {
        key: "currentSignups",
        label: "Signups · this week",
        color: "var(--kpi-series-2)",
    },
    {
        key: "previousSignups",
        label: "Signups · last week",
        color: "var(--kpi-series-2)",
        dashed: true,
    },
];

export function DailyComparisonChart({ data, signupsSyncedAt }) {
    const [metric, setMetric] = useState("Revenue");
    const revenue = metric === "Revenue";
    return (
        <LineChart
            title={`${metric} · this week vs last week`}
            data={data}
            series={revenue ? SERIES.slice(0, 2) : SERIES.slice(2)}
            format={revenue ? "currency" : "number"}
            xLabel={(row) => row.day}
            xAxisUnit="day"
            action={
                <div className="flex flex-wrap items-center gap-3">
                    <Text as="span" size="micro" tone="muted">
                        UTC · Today is partial
                        {!revenue &&
                            (signupsSyncedAt
                                ? ` · Signups as of ${signupsSyncedAt.slice(0, 16).replace("T", " ")} UTC`
                                : " · Signups unavailable")}
                    </Text>
                    <fieldset
                        aria-label="Weekly comparison metric"
                        className="flex gap-1"
                    >
                        {["Revenue", "Signups"].map((label) => (
                            <TabButton
                                key={label}
                                size="xs"
                                active={metric === label}
                                onClick={() => setMetric(label)}
                            >
                                {label}
                            </TabButton>
                        ))}
                    </fieldset>
                </div>
            }
        />
    );
}
