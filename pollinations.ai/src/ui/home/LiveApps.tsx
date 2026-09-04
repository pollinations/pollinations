import { ContentHeader, InlineLink, ScrollArea } from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import { useAppShowcase } from "../../data/publicStats";
import { AppCarousel } from "../apps/AppCarousel";

/**
 * A wide shelf you skim sideways — the same strip the Apps spotlight uses, so
 * Hello shows eight covers instead of three tiles in yet another 3-up grid.
 * Missing screenshots use the shared Polli fallback, so the shelf remains
 * visual without pretending generated art is the real app.
 */
export function LiveApps() {
    const { data: featured, loading, failed } = useAppShowcase();

    // Only disappears when the directory loaded fine and genuinely had
    // nothing to show — a failure gets a line, not a silent hole.
    if (!loading && !failed && featured.length === 0) return null;

    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow="Live now"
                title="Apps from the community."
                action={
                    <InlineLink as={Link} to="/apps" directional>
                        See all apps
                    </InlineLink>
                }
            />
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
                    The app directory couldn’t be loaded right now.
                </p>
            ) : (
                <AppCarousel
                    apps={featured}
                    size="compact"
                    ariaLabel="Apps built on Pollinations"
                />
            )}
        </section>
    );
}
