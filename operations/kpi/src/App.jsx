import {
    Alert,
    AppHeader,
    Button,
    ColorModeToggle,
    DownloadIcon,
    Heading,
    StatCard,
    Surface,
    Text,
} from "@pollinations/ui";
import { useState } from "react";
import { FunnelBars } from "./components/FunnelBars";
import { KPITrendTable } from "./components/KPITrendTable";
import { KpiExplorer } from "./components/KpiExplorer";
import { LineChart } from "./components/LineChart";
import { RetentionTable } from "./components/RetentionTable";
import { Trend } from "./components/Trend";
import { SOURCE_LABELS, useKpiData } from "./hooks/useKpiData";
import { calcChange, formatValue, weekLabel } from "./lib/format";

const EXPORT_COLUMNS = [
    ["week", "Week"],
    ["registrations", "Registrations"],
    ["activations", "Activations"],
    ["wau", "WAU"],
    ["tokens", "Tokens"],
    ["revenue", "Revenue"],
    ["packPurchases", "Pack purchases"],
    ["communityUserPct", "Community models user %"],
    ["communityRequestPct", "Community models request %"],
    ["communityAvailability", "Community models availability %"],
];

function exportCsv(weeklyData) {
    const csv = [
        EXPORT_COLUMNS.map(([, header]) => header).join(","),
        ...weeklyData.map((row) =>
            EXPORT_COLUMNS.map(([key]) => row[key] ?? "").join(","),
        ),
    ].join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kpi-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function Tile({ label, value, format, current, previous }) {
    return (
        <Surface>
            <StatCard
                label={label}
                value={formatValue(value, format)}
                detail={<Trend change={calcChange(current, previous)} />}
            />
        </Surface>
    );
}

function LoadingScreen({ done, active }) {
    return (
        <main className="mx-auto flex w-full max-w-sm flex-col gap-4 px-4 py-16">
            <Text as="p" tone="soft">
                Loading KPIs from all data sources…
            </Text>
            <div className="flex flex-col gap-1.5">
                {SOURCE_LABELS.map((label) => {
                    const complete = done.includes(label);
                    const running = !complete && active === label;
                    return (
                        <Text
                            key={label}
                            as="div"
                            size="sm"
                            tone={
                                running ? "strong" : complete ? "base" : "muted"
                            }
                            className="flex items-center gap-2"
                        >
                            <span
                                aria-hidden="true"
                                className="w-4 text-center"
                            >
                                {complete ? "✓" : running ? "◍" : "·"}
                            </span>
                            {label}
                        </Text>
                    );
                })}
            </div>
        </main>
    );
}

const EXPLORER_ID = "kpi-explorer";

export default function App() {
    // Which unit each cycling row is showing, and which row the explorer plots.
    // Both live here so the chart follows the table.
    const [viewIndex, setViewIndex] = useState({});
    const [explored, setExplored] = useState("registrations");

    const cycleView = (key) =>
        setViewIndex((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));

    const graphKpi = (key) => {
        setExplored(key);
        document
            .getElementById(EXPLORER_ID)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const {
        loading,
        done,
        active,
        missing,
        weeklyData,
        fullWeeks,
        historyWeeks,
        retentionData,
        github,
        currentWeek,
        previousWeek,
    } = useKpiData();

    if (loading) return <LoadingScreen done={done} active={active} />;

    const wapc = currentWeek?.packPurchases || 0;
    const funnelStages = currentWeek
        ? [
              { stage: "Signups", count: currentWeek.registrations || 0 },
              {
                  stage: "Activated",
                  count: currentWeek.activations || 0,
                  of: "Signups",
              },
              // WAU is not a subset of this week's signups, so it carries no
              // step rate — only Paying is measured against it.
              { stage: "Active (WAU)", count: currentWeek.wau || 0 },
              {
                  stage: "Paying",
                  count: currentWeek.packPurchases || 0,
                  of: "Active (WAU)",
              },
          ]
        : [];

    return (
        <div className="min-h-screen bg-app-bg">
            <AppHeader
                navLabel="KPI dashboard links"
                autoHide
                innerClassName="polli:max-w-7xl polli:flex-row polli:items-center polli:justify-between"
            >
                <Button
                    size="sm"
                    className="h-9 px-3 py-0"
                    onClick={() => exportCsv(weeklyData)}
                >
                    <span className="inline-flex items-center gap-1.5">
                        <DownloadIcon className="h-4 w-4" />
                        Export CSV
                    </span>
                </Button>
                <ColorModeToggle />
            </AppHeader>

            <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 md:py-7">
                <div className="flex flex-col gap-1">
                    <Heading as="h1" size="title">
                        KPI Dashboard
                    </Heading>
                    <Text as="p" tone="base">
                        Weekly KPIs for pollinations.ai. Figures are the last
                        full week ({weekLabel(currentWeek?.week)}) against the
                        one before it.
                    </Text>
                </div>

                {missing.length > 0 && (
                    <Alert intent="warning" title="Incomplete data">
                        No rows returned for: {missing.join(", ")}. Everything
                        else on this page is still live.
                    </Alert>
                )}

                <Surface
                    variant="panel"
                    className="flex flex-wrap items-end justify-between gap-4"
                >
                    <div className="flex flex-col gap-1">
                        <Text
                            as="div"
                            size="micro"
                            tone="soft"
                            weight="bold"
                            className="uppercase tracking-wide"
                        >
                            North star · {weekLabel(currentWeek?.week)}
                        </Text>
                        <Heading as="h2" size="subsection">
                            Weekly active paying customers
                        </Heading>
                        <Text as="p" size="sm" tone="muted">
                            Users who bought a Pollen pack that week.
                        </Text>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className="font-bold text-4xl text-theme-text-strong tabular-nums">
                            {formatValue(wapc)}
                        </span>
                        <Trend
                            change={calcChange(
                                wapc,
                                previousWeek?.packPurchases,
                            )}
                        />
                    </div>
                </Surface>

                <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
                    <Tile
                        label="New signups"
                        value={currentWeek?.registrations}
                        current={currentWeek?.registrations}
                        previous={previousWeek?.registrations}
                    />
                    <Tile
                        label="Activated (D7)"
                        value={currentWeek?.activations}
                        current={currentWeek?.activations}
                        previous={previousWeek?.activations}
                    />
                    <Tile
                        label="WAU"
                        value={currentWeek?.wau}
                        current={currentWeek?.wau}
                        previous={previousWeek?.wau}
                    />
                    <Tile
                        label="Tokens used"
                        value={currentWeek?.tokens}
                        format="compact"
                        current={currentWeek?.tokens}
                        previous={previousWeek?.tokens}
                    />
                    <Tile
                        label="Revenue"
                        value={currentWeek?.revenue}
                        format="currency"
                        current={currentWeek?.revenue}
                        previous={previousWeek?.revenue}
                    />
                    <Tile
                        label="GitHub stars"
                        value={github.stars}
                        format="compact"
                    />
                </div>

                <KPITrendTable
                    weeklyData={weeklyData}
                    viewIndex={viewIndex}
                    onCycle={cycleView}
                    onGraph={graphKpi}
                />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <LineChart
                        title="Acquisition & activation"
                        data={historyWeeks}
                        series={[
                            { key: "registrations", label: "Signups" },
                            { key: "activations", label: "Activated (D7)" },
                            { key: "wau", label: "WAU" },
                        ]}
                    />
                    <LineChart
                        title="Usage & revenue"
                        data={fullWeeks}
                        series={[
                            {
                                key: "tokens",
                                label: "Tokens",
                                format: "compact",
                            },
                            {
                                key: "revenue",
                                label: "Revenue",
                                format: "currency",
                            },
                        ]}
                        dualAxis
                    />
                    <KpiExplorer
                        id={EXPLORER_ID}
                        weeks={historyWeeks}
                        selected={explored}
                        viewIndex={viewIndex}
                        onSelect={setExplored}
                    />
                    <FunnelBars
                        title={`Conversion funnel · ${weekLabel(currentWeek?.week)}`}
                        stages={funnelStages}
                    />
                </div>

                <RetentionTable data={retentionData} />

                <Text as="p" size="micro" tone="muted" className="pt-2">
                    Myceli.AI · sources: D1, Tinybird, Stripe, GitHub
                </Text>
            </main>
        </div>
    );
}
