import {
    ArrowRightIcon,
    Button,
    ContentHeader,
    cn,
    ScrollArea,
} from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import { useAppShowcase } from "../../data/publicStats";
import { AppCarousel } from "../apps/AppCarousel";

/**
 * A compact shelf of active community apps.
 * Missing screenshots use the shared Polli fallback, so the shelf remains
 * visual without pretending generated art is the real app.
 */
export function LiveApps({ className }: { className?: string }) {
    const { data: featured, loading, failed } = useAppShowcase();

    // Only disappears when the directory loaded fine and genuinely had
    // nothing to show — a failure gets a line, not a silent hole.
    if (!loading && !failed && featured.length === 0) return null;

    return (
        <section className={cn("flex flex-col gap-5", className)}>
            <ContentHeader
                eyebrow="Live now"
                title="Apps from the community."
            />
            <Button
                as={Link}
                to="/apps"
                appearance="raised"
                size="sm"
                className="self-start gap-2"
            >
                See all apps
                <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
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
                    ariaLabel="Apps built on Pollinations"
                />
            )}
        </section>
    );
}
