import {
    ClockIcon,
    CodeIcon,
    CopyField,
    InlineLink,
    Section,
} from "@pollinations/ui";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
    ActivityOverview,
    type ActivitySearch,
} from "../components/activity/activity-overview.tsx";
import {
    activityTimezone,
    parseActivityPeriod,
} from "../components/activity/activity-period";
import { LastEventsPanel } from "../components/pollen/last-events-panel.tsx";
import { Footnotes } from "../components/pollen/pollen-balance.tsx";

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
                <Footnotes>
                    <p className="flex items-start gap-1.5">
                        <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Times shown in your timezone ({activityTimezone()})
                        </span>
                    </p>
                    {/* The Keys footer's terminal line: the catalog's small
                        copy pill, indented under its text. */}
                    <div className="flex items-start gap-1.5">
                        <CodeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <span>
                                From your terminal ·{" "}
                                <InlineLink href="https://gen.pollinations.ai/docs#tag/cli">
                                    CLI docs
                                </InlineLink>
                            </span>
                            <div className="w-fit min-w-0 max-w-full">
                                <CopyField
                                    label="Copy CLI command"
                                    value="polli usage --history"
                                    size="sm"
                                />
                            </div>
                        </div>
                    </div>
                </Footnotes>
            </Section>
        </>
    );
}
