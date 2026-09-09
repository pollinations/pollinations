import { Section } from "@pollinations/ui";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
    type ActivityPeriod,
    parseActivityPeriod,
} from "../components/activity/activity-period";
import { EarningsGraph } from "../components/activity/earnings-graph.tsx";
import type { Metric } from "../components/activity/types.ts";
import { UsageSection } from "../components/activity/usage-section.tsx";
import { LastEventsPanel } from "../components/pollen/last-events-panel.tsx";

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
        const usage = parseActivityPeriod(
            search.usageGranularity,
            search.usagePeriod,
            search.usageBucket,
            search.usageAnchor,
        );
        const earnings = parseActivityPeriod(
            search.earningsGranularity,
            search.earningsPeriod,
            search.earningsBucket,
            search.earningsAnchor,
        );
        return {
            usageGranularity: usage.granularity,
            usagePeriod: usage.period,
            usageBucket: usage.bucket,
            usageAnchor: usage.anchor,
            earningsGranularity: earnings.granularity,
            earningsPeriod: earnings.period,
            earningsBucket: earnings.bucket,
            earningsAnchor: earnings.anchor,
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
    const usagePeriod: ActivityPeriod = {
        granularity: search.usageGranularity,
        period: search.usagePeriod,
        bucket: search.usageBucket,
        anchor: search.usageAnchor,
    };
    const earningsPeriod: ActivityPeriod = {
        granularity: search.earningsGranularity,
        period: search.earningsPeriod,
        bucket: search.earningsBucket,
        anchor: search.earningsAnchor,
    };

    function updateSearch(changes: Partial<typeof search>): void {
        void navigate({
            resetScroll: false,
            search: (current) => ({ ...current, ...changes }),
        });
    }

    return (
        <div className="flex flex-col gap-6">
            <Section title="Usage" framed>
                <UsageSection
                    period={usagePeriod}
                    onPeriodChange={(value) =>
                        updateSearch({
                            usageGranularity: value.granularity,
                            usagePeriod: value.period,
                            usageBucket: value.bucket,
                            usageAnchor: value.anchor,
                        })
                    }
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
            </Section>
            <Section title="Earnings" framed>
                <EarningsGraph
                    period={earningsPeriod}
                    onPeriodChange={(value) =>
                        updateSearch({
                            earningsGranularity: value.granularity,
                            earningsPeriod: value.period,
                            earningsBucket: value.bucket,
                            earningsAnchor: value.anchor,
                        })
                    }
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
            <p className="text-micro text-theme-text-muted">
                Updated hourly · All times UTC
            </p>
            <Section title="Last events" framed>
                <LastEventsPanel />
            </Section>
        </div>
    );
}
