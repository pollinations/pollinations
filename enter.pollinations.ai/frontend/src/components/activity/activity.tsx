import { PeriodPicker, type PeriodSelection, Section } from "@pollinations/ui";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { LastEventsPanel } from "../pollen/last-events-panel.tsx";
import type { ActivitySearch } from "./activity-search.ts";
import { EarningsGraph } from "./earnings-graph.tsx";
import { UsageSection } from "./usage-section.tsx";

const ACTIVITY_MIN_DATE = new Date("2026-01-01T00:00:00.000Z");

export function Activity() {
    const search = useSearch({ from: "/_dashboard/activity" });
    const navigate = useNavigate({ from: "/activity" });
    const period: PeriodSelection = {
        granularity: search.granularity,
        period: search.period,
    };

    useEffect(() => {
        const urlSearch = new URLSearchParams(window.location.search);
        if (
            urlSearch.get("granularity") === search.granularity &&
            urlSearch.get("period") === search.period
        ) {
            return;
        }
        void navigate({
            replace: true,
            search: (previous) => previous,
        });
    }, [navigate, search.granularity, search.period]);

    function updateSearch(changes: Partial<ActivitySearch>): void {
        void navigate({
            search: (previous) => ({ ...previous, ...changes }),
        });
    }

    return (
        <div className="flex flex-col gap-6">
            <Section title="Events over time" framed>
                <div className="flex flex-col gap-1">
                    <PeriodPicker
                        value={period}
                        onChange={({ granularity, period }) =>
                            updateSearch({ granularity, period })
                        }
                        minDate={ACTIVITY_MIN_DATE}
                    />
                    <p className="text-micro text-theme-text-muted">
                        Usage refreshes hourly. Times are shown in UTC.
                    </p>
                </div>
                <UsageSection
                    period={period}
                    metric={search.usageMetric ?? "pollen"}
                    selectedKeyIds={search.usageKeys ?? []}
                    selectedModels={search.usageModels ?? []}
                    onMetricChange={(metric) =>
                        updateSearch({
                            usageMetric:
                                metric === "pollen" ? undefined : metric,
                        })
                    }
                    onSelectedKeyIdsChange={(usageKeys) =>
                        updateSearch({
                            usageKeys:
                                usageKeys.length > 0 ? usageKeys : undefined,
                        })
                    }
                    onSelectedModelsChange={(usageModels) =>
                        updateSearch({
                            usageModels:
                                usageModels.length > 0
                                    ? usageModels
                                    : undefined,
                        })
                    }
                />
                <EarningsGraph
                    period={period}
                    metric={search.earningsMetric ?? "pollen"}
                    selectedAppKeyIds={search.earningsApps ?? []}
                    selectedModelIds={search.earningsModels ?? []}
                    onMetricChange={(metric) =>
                        updateSearch({
                            earningsMetric:
                                metric === "pollen" ? undefined : metric,
                        })
                    }
                    onSelectedAppKeyIdsChange={(earningsApps) =>
                        updateSearch({
                            earningsApps:
                                earningsApps.length > 0
                                    ? earningsApps
                                    : undefined,
                        })
                    }
                    onSelectedModelIdsChange={(earningsModels) =>
                        updateSearch({
                            earningsModels:
                                earningsModels.length > 0
                                    ? earningsModels
                                    : undefined,
                        })
                    }
                />
            </Section>
            <Section title="Last events" framed>
                <LastEventsPanel />
            </Section>
        </div>
    );
}
