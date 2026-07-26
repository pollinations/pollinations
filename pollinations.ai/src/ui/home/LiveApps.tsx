import { Surface } from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
    isBuzz,
    isPollen,
    sortApps,
    useAppDirectory,
} from "../../data/publicStats";
import { SectionHeader } from "../site/PageHeader";

/**
 * A slice of the real catalogue on the landing page — proof that the ecosystem
 * exists, rather than a claim that it does. Same source and sort as /apps, so
 * the three shown here are genuinely the busiest.
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
                aside={
                    <Link
                        to="/apps"
                        className="text-sm font-semibold text-theme-text-soft"
                    >
                        Browse the ecosystem →
                    </Link>
                }
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
                {featured.map((app) => (
                    <Surface
                        key={app.name}
                        variant="card"
                        className="flex flex-col gap-2 p-5"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="font-subheading text-lg text-theme-text-strong">
                                {app.emoji} {app.name}
                            </h3>
                            <span className="shrink-0 text-sm">
                                {isPollen(app) ? "🏵️" : "🐝"}
                            </span>
                        </div>
                        <p className="text-sm leading-relaxed text-theme-text-base">
                            {app.description}
                        </p>
                        {app.web_url && (
                            <a
                                href={app.web_url}
                                className="mt-auto pt-2 text-sm font-semibold text-theme-text-soft"
                            >
                                Open ↗
                            </a>
                        )}
                    </Surface>
                ))}
            </div>
        </section>
    );
}
