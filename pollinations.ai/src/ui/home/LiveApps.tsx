import {
    ArrowRightIcon,
    Button,
    ContentHeader,
    ScrollArea,
    TabButton,
} from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useNewestApps, useWeeklyApps } from "../../data/publicStats";
import { AppCarousel } from "../apps/AppCarousel";

const TABS = [
    {
        label: "Most used",
        subtitle: "The most-used Pollen Pay apps over the last 7 days.",
    },
    { label: "Newest", subtitle: "The latest apps to join the catalog." },
] as const;

/**
 * A compact shelf of community apps: the busiest ones that use connected
 * wallets, or the newest listings. Missing screenshots use the shared Polli
 * fallback, so the shelf remains visual without pretending generated art is
 * the real app.
 */
export function LiveApps() {
    const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
    const weekly = useWeeklyApps();
    const newest = useNewestApps();
    const { data: apps, loading, failed } = tab === TABS[0] ? weekly : newest;

    // Only disappears when the ranking loaded fine and genuinely had
    // nothing to show — a failure gets a line, not a silent hole.
    if (!weekly.loading && !weekly.failed && weekly.data.length === 0)
        return null;

    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow={null}
                title="Apps from the community."
                subtitle={tab.subtitle}
            />
            <div className="flex flex-wrap items-center gap-2">
                {TABS.map((candidate) => (
                    <TabButton
                        key={candidate.label}
                        active={tab === candidate}
                        size="sm"
                        onClick={() => setTab(candidate)}
                    >
                        {candidate.label}
                    </TabButton>
                ))}
                <Button
                    as={Link}
                    to="/apps"
                    intent="neutral"
                    size="md"
                    className="ml-auto gap-2"
                >
                    See all apps
                    <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                </Button>
            </div>
            {loading ? (
                <ScrollArea
                    axis="x"
                    tabIndex={0}
                    aria-label="Loading apps built on Pollinations"
                    className="flex gap-4 pb-2.5"
                >
                    {[0, 1, 2].map((i) => (
                        <div
                            key={`skeleton-${i}`}
                            aria-hidden="true"
                            className="h-64 w-59 flex-none animate-pulse rounded-2xl bg-theme-bg-subtle"
                        />
                    ))}
                </ScrollArea>
            ) : failed ? (
                <p className="rounded-2xl border border-theme-border border-dashed px-5 py-6 text-sm text-theme-text-muted">
                    Apps couldn’t be loaded right now.
                </p>
            ) : (
                <AppCarousel key={tab.label} apps={apps} />
            )}
        </section>
    );
}
