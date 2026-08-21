import {
    currentPeriod,
    type PeriodGranularity,
    PeriodPicker,
    Section,
} from "@pollinations/ui";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { EarningsGraph } from "../components/activity/earnings-graph.tsx";
import type { Metric } from "../components/activity/types.ts";
import { UsageSection } from "../components/activity/usage-section.tsx";
import { LastEventsPanel } from "../components/pollen/last-events-panel.tsx";

const ACTIVITY_MIN_DATE = new Date("2026-01-01T00:00:00.000Z");
const PERIOD_PATTERN: Record<PeriodGranularity, RegExp> = {
    day: /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/,
    week: /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/,
    month: /^\d{4}-(0[1-9]|1[0-2])$/,
};

function stringArray(value: unknown): string[] | undefined {
    return Array.isArray(value) &&
        value.every((item) => typeof item === "string")
        ? value
        : undefined;
}

function metric(value: unknown): Metric | undefined {
    return value === "requests" ? value : undefined;
}

export const Route = createFileRoute("/_dashboard/activity")({
    validateSearch: (search: Record<string, unknown>) => {
        const fallback = currentPeriod();
        const granularity =
            search.granularity === "day" ||
            search.granularity === "week" ||
            search.granularity === "month"
                ? search.granularity
                : fallback.granularity;
        const period =
            typeof search.period === "string" &&
            PERIOD_PATTERN[granularity].test(search.period)
                ? search.period
                : undefined;
        return {
            granularity: period ? granularity : fallback.granularity,
            period: period ?? fallback.period,
            usageMetric: metric(search.usageMetric),
            usageKeys: stringArray(search.usageKeys),
            usageModels: stringArray(search.usageModels),
            earningsMetric: metric(search.earningsMetric),
            earningsApps: stringArray(search.earningsApps),
            earningsModels: stringArray(search.earningsModels),
        };
    },
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: ActivityPage,
});

function ActivityPage() {
    const search = Route.useSearch();
    const navigate = useNavigate({ from: "/activity" });
    const period = {
        granularity: search.granularity,
        period: search.period,
    };

    function updateSearch(changes: Partial<typeof search>): void {
        void navigate({
            search: (current) => ({ ...current, ...changes }),
        });
    }

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.has("granularity") && params.has("period")) return;
        void navigate({ search, replace: true });
    }, [navigate, search]);

    return (
        <div className="flex flex-col gap-6">
            <Section title="Events over time" framed>
                <div className="flex flex-col gap-1">
                    <PeriodPicker
                        value={period}
                        onChange={updateSearch}
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
                            usageKeys: usageKeys.length ? usageKeys : undefined,
                        })
                    }
                    onSelectedModelsChange={(usageModels) =>
                        updateSearch({
                            usageModels: usageModels.length
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
                            earningsApps: earningsApps.length
                                ? earningsApps
                                : undefined,
                        })
                    }
                    onSelectedModelIdsChange={(earningsModels) =>
                        updateSearch({
                            earningsModels: earningsModels.length
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
