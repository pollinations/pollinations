import { ClockIcon, InlineLink, Section, TerminalIcon } from "@pollinations/ui";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
    ActivityOverview,
    type ActivitySearch,
} from "../components/activity/activity-overview.tsx";
import {
    activityTimezone,
    parseActivityPeriod,
} from "../components/activity/activity-period";
import { CopyValue } from "../components/models/copy-value.tsx";
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
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <TerminalIcon className="h-3.5 w-3.5 shrink-0" />
                        <span>Get this history in your terminal:</span>
                        <CopyValue
                            value="polli usage --history"
                            label="Copy CLI command"
                            showCopyIcon
                        />
                        <span aria-hidden="true">·</span>
                        <InlineLink href="https://gen.pollinations.ai/docs#tag/cli">
                            CLI docs
                        </InlineLink>
                    </div>
                </Footnotes>
            </Section>
        </>
    );
}
