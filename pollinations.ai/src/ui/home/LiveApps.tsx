import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { isBuzz, sortApps, useAppDirectory } from "../../data/publicStats";
import { AppTile } from "../apps/cards";
import { ArrowLink, CardGrid, SectionHeader } from "../site/kit";

/**
 * Three, with artwork — the mockup's proportion. Six text-only cards read as
 * another list; three with images read as a shelf, and they're the only
 * pictures on the page. Same tile the Apps spotlight uses, one size up.
 */
export function LiveApps() {
    const { data: apps, loading, failed } = useAppDirectory();

    const featured = useMemo(
        () =>
            apps
                .filter((app) => isBuzz(app) && Boolean(app.description))
                .slice()
                .sort(sortApps)
                .slice(0, 3),
        [apps],
    );

    // Only disappears when the directory loaded fine and genuinely had
    // nothing to show — a failure gets a line, not a silent hole.
    if (!loading && !failed && featured.length === 0) return null;

    return (
        <section className="flex flex-col gap-5">
            <SectionHeader
                eyebrow="Built on Pollinations"
                title={
                    loading
                        ? "Apps are already live."
                        : `${apps.length} apps are already live.`
                }
                action={
                    <ArrowLink as={Link} to="/apps">
                        Browse the ecosystem
                    </ArrowLink>
                }
            />
            {loading ? (
                <CardGrid gap="gap-4">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={`skeleton-${i}`}
                            aria-hidden="true"
                            className="h-64 animate-pulse rounded-2xl bg-theme-bg-subtle"
                        />
                    ))}
                </CardGrid>
            ) : failed ? (
                <p className="rounded-2xl border border-theme-border border-dashed px-5 py-6 text-sm text-theme-text-muted">
                    The app directory couldn’t be loaded right now.
                </p>
            ) : (
                <CardGrid gap="gap-4">
                    {featured.map((app) => (
                        <AppTile key={app.name} app={app} />
                    ))}
                </CardGrid>
            )}
        </section>
    );
}
