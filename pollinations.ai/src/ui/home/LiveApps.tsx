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
    const { data: apps, loading } = useAppDirectory();

    const featured = useMemo(
        () =>
            apps
                .filter((app) => isBuzz(app) && Boolean(app.description))
                .slice()
                .sort(sortApps)
                .slice(0, 3),
        [apps],
    );

    if (!loading && featured.length === 0) return null;

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
            <CardGrid gap="gap-4">
                {featured.map((app) => (
                    <AppTile key={app.name} app={app} />
                ))}
            </CardGrid>
        </section>
    );
}
