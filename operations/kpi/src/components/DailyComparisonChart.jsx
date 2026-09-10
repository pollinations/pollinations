import { Text } from "@pollinations/ui";
import { LineChart } from "./LineChart";

const SERIES = [
    {
        key: "currentRevenue",
        label: "Revenue · this week",
        format: "currency",
        axis: 0,
        color: "var(--kpi-series-1)",
    },
    {
        key: "previousRevenue",
        label: "Revenue · last week",
        format: "currency",
        axis: 0,
        color: "var(--kpi-series-1)",
        dashed: true,
    },
    {
        key: "currentSignups",
        label: "Signups · this week",
        axis: 1,
        color: "var(--kpi-series-2)",
    },
    {
        key: "previousSignups",
        label: "Signups · last week",
        axis: 1,
        color: "var(--kpi-series-2)",
        dashed: true,
    },
];

export function DailyComparisonChart({ data, signupsSyncedAt }) {
    return (
        <LineChart
            title="Revenue & signups · this week vs last week"
            data={data}
            series={SERIES}
            dualAxis
            axisLabels={["Revenue ($)", "Signups"]}
            xLabel={(row) => row.day}
            xAxisUnit="day"
            action={
                <Text as="span" size="micro" tone="muted">
                    UTC · Today is partial
                    {signupsSyncedAt
                        ? ` · Signups as of ${signupsSyncedAt.slice(0, 16).replace("T", " ")} UTC`
                        : " · Signups unavailable"}
                </Text>
            }
        />
    );
}
