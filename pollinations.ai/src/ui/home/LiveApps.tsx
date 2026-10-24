import {
    ArrowRightIcon,
    Button,
    ClockIcon,
    ContentHeader,
    EmptyState,
    ScrollArea,
    Skeleton,
    TabButton,
    TrendUpIcon,
} from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useNewestApps, useWeeklyApps } from "../../data/publicStats";
import { AppCarousel } from "../apps/AppCarousel";

const TABS = ["Most used this week", "Newest"] as const;
// The same icons as the Popular and New sorts on /apps.
const TAB_ICONS = { [TABS[0]]: TrendUpIcon, [TABS[1]]: ClockIcon };

/**
 * A compact shelf of community apps: the busiest ones over the last 7 days
 * (counting only users who pay with their own Pollen), or the newest
 * listings. Missing screenshots use the shared Polli fallback, so the shelf
 * remains visual without pretending generated art is the real app.
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
            <ContentHeader eyebrow={null} title="Apps from the community." />
            <div className="flex flex-wrap items-center gap-2">
                {TABS.map((label) => {
                    const Icon = TAB_ICONS[label];
                    return (
                        <TabButton
                            key={label}
                            active={tab === label}
                            size="sm"
                            icon={<Icon />}
                            onClick={() => setTab(label)}
                        >
                            {label}
                        </TabButton>
                    );
                })}
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
                    className="flex gap-4 pb-4"
                >
                    {[0, 1, 2].map((i) => (
                        <Skeleton
                            key={`skeleton-${i}`}
                            className="h-67 w-59 flex-none"
                        />
                    ))}
                </ScrollArea>
            ) : failed ? (
                <EmptyState>Apps couldn’t be loaded right now.</EmptyState>
            ) : (
                <AppCarousel key={tab} apps={apps} />
            )}
        </section>
    );
}
