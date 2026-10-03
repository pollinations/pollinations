import {
    ArrowRightIcon,
    Button,
    ContentHeader,
    LinkCard,
} from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import { useArt } from "../../art";
import { appIdentity, useWeeklyApps } from "../../data/publicStats";
import { AppListing } from "../apps/cards";

/**
 * A banner into the app directory, then this week's three most-used apps
 * (counting only users who pay with their own Pollen). The whole banner is
 * the link; its button only shows where it goes.
 */
export function LiveApps() {
    const scene = useArt("apps", "hero");
    const { data: apps, loading, failed } = useWeeklyApps();

    return (
        <section className="flex flex-col gap-4">
            <LinkCard
                as={Link}
                to="/apps"
                surfaceClassName="overflow-hidden p-0 sm:min-h-64 sm:justify-center"
            >
                <img
                    src={scene.src}
                    srcSet={scene.srcSet}
                    sizes="(max-width: 640px) 100vw, 1100px"
                    alt=""
                    aria-hidden="true"
                    width={2048}
                    height={854}
                    loading="lazy"
                    decoding="async"
                    className="apps-banner-scene pointer-events-none aspect-[2/1] w-full select-none object-cover object-right sm:absolute sm:inset-0 sm:aspect-auto sm:h-full"
                />
                <div className="relative flex flex-col items-start gap-5 p-5 sm:max-w-[55%] sm:p-8">
                    <ContentHeader
                        eyebrow={null}
                        title="Apps from the community."
                        subtitle="Browse everything people build with Pollinations, filtered by category and platform."
                    />
                    <Button
                        as="span"
                        intent="brand"
                        size="lg"
                        className="gap-2 self-start"
                    >
                        Explore apps
                        <ArrowRightIcon className="size-4" aria-hidden="true" />
                    </Button>
                </div>
            </LinkCard>
            {loading ? (
                <div
                    aria-hidden="true"
                    className="grid grid-cols-1 gap-4 sm:grid-cols-3"
                >
                    {[0, 1, 2].map((i) => (
                        <div
                            key={`skeleton-${i}`}
                            className="h-24 animate-pulse rounded-2xl bg-theme-bg-subtle sm:h-72"
                        />
                    ))}
                </div>
            ) : failed ? (
                <p className="rounded-2xl border border-theme-border border-dashed px-5 py-6 text-sm text-theme-text-muted">
                    This week’s most-used apps couldn’t be loaded right now.
                </p>
            ) : apps.length > 0 ? (
                <>
                    <h3 className="font-semibold text-sm text-theme-text-muted">
                        Most used this week
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 sm:gap-4">
                        {apps.slice(0, 3).map((app) => (
                            <AppListing key={appIdentity(app)} app={app} />
                        ))}
                    </div>
                </>
            ) : null}
        </section>
    );
}
