import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { isBuzz, sortApps, useAppDirectory } from "../../data/publicStats";
import { AppTile } from "../apps/cards";
import { appCover } from "../apps/cover";
import { ArrowLink, CardGrid, ScrollStrip, SectionHeader } from "../site/kit";

/**
 * A wide shelf you skim sideways — the same strip the Apps spotlight uses, so
 * Hello shows eight covers instead of three tiles in yet another 3-up grid.
 * Only apps that actually have cover art qualify; a shelf is pictures.
 */
export function LiveApps() {
    const { data: apps, loading, failed } = useAppDirectory();

    const featured = useMemo(
        () =>
            apps
                .filter(
                    (app) =>
                        isBuzz(app) &&
                        Boolean(app.description) &&
                        appCover(app.name, app.screenshot_url) !== null,
                )
                .slice()
                .sort(sortApps)
                .slice(0, 8),
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
                        ? "Apps built on Pollinations."
                        : `${apps.length} apps built on Pollinations.`
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
                <ScrollStrip ariaLabel="Apps built on Pollinations">
                    {featured.map((app) => (
                        <AppTile
                            key={app.name}
                            app={app}
                            imageClassName="h-30"
                            className="w-59 flex-none"
                        />
                    ))}
                </ScrollStrip>
            )}
        </section>
    );
}
