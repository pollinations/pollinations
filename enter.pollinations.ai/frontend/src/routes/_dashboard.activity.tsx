import { Section } from "@pollinations/ui";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
    ActivityOverview,
    type ActivitySearch,
} from "../components/activity/activity-overview.tsx";
import {
    activityTimezone,
    parseActivityPeriod,
} from "../components/activity/activity-period";
import { CliHint } from "../components/cli-hint.tsx";
import { LastEventsPanel } from "../components/pollen/last-events-panel.tsx";

function stringArray(value: unknown): string[] | undefined {
    return Array.isArray(value) &&
        value.every((item) => typeof item === "string")
        ? value
        : undefined;
}

export const Route = createFileRoute("/_dashboard/activity")({
    validateSearch: (search: Record<string, unknown>): ActivitySearch => ({
        ...parseActivityPeriod(
            search.granularity,
            search.period,
            search.bucket,
            search.anchor,
        ),
        tab: search.tab === "earnings" ? search.tab : undefined,
        metric: search.metric === "requests" ? search.metric : undefined,
        group: search.group === "key" ? search.group : undefined,
        keys: stringArray(search.keys),
        models: stringArray(search.models),
    }),
    beforeLoad: ({ context, location }) => {
        if (!context.user && !context.sessionUnavailable) {
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

    return (
        <>
            <Section title="Overview" framed>
                <ActivityOverview
                    search={search}
                    onChange={(changes) =>
                        void navigate({
                            resetScroll: false,
                            search: (current) => ({ ...current, ...changes }),
                        })
                    }
                />
            </Section>
            <Section title="Last events" framed>
                <LastEventsPanel />
            </Section>
            <p className="px-4 text-micro text-theme-text-muted sm:px-0">
                Times shown in your timezone ({activityTimezone()}).
            </p>
            <CliHint command="usage --history" />
        </>
    );
}
