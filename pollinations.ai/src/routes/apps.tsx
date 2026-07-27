import { TabButton } from "@pollinations/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
    type DirectoryApp,
    isBuzz,
    isFresh,
    isPollen,
    platformsOf,
    sortApps,
    useAppDirectory,
} from "../data/publicStats";
// Hand-picked, and the only editorial thing on the page — every badge in
// APPS.md is computed from traffic or recency, so none of them can say "we
// think this is good". JSON because scripts/generate-app-art.mjs reads the
// same list to decide which apps get cover art.
import SPOTLIGHT from "../data/spotlight.json";
import { AppCard, AppHero, AppTile } from "../ui/apps/cards";
import { appCover } from "../ui/apps/cover";
import {
    ActionButton,
    CardGrid,
    Hero,
    PageHeader,
    PixelLabel,
    PixelRule,
    ScrollStrip,
    SectionHeader,
} from "../ui/site/kit";
import {
    APP_CATEGORIES,
    APP_PLATFORMS,
    APP_SIGNALS,
    type AppSearch,
    CATEGORY_LABELS,
    listOf,
    PLATFORM_LABELS,
    SIGNAL_LABELS,
    toggle,
    validateAppSearch,
} from "./-app-search";

export const Route = createFileRoute("/apps")({
    validateSearch: validateAppSearch,
    component: AppsPage,
});

const SIGNAL_TEST = { buzz: isBuzz, pollen: isPollen, fresh: isFresh } as const;

/** A small filled pill, for the one official card on the page. */
function OpenPill({ children }: { children: string }) {
    return (
        <span className="rounded-[10px] bg-theme-bg-active px-4.5 py-2 text-sm font-semibold text-theme-text-strong shadow-[2px_2px_0_rgba(17,5,24,0.18)]">
            {children}
        </span>
    );
}

/**
 * One row of pills. The label sits in a fixed column so all three axes start
 * on the same left edge — three unlabelled rows read as one long list.
 */
function FilterAxis<T extends string>({
    label,
    values,
    labels,
    selected,
    onToggle,
}: {
    label: string;
    values: readonly T[];
    labels: Record<T, string>;
    selected: T[];
    onToggle: (value: T) => void;
}) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <PixelLabel variant="chrome" className="w-20 shrink-0">
                {label}
            </PixelLabel>
            <div className="flex flex-1 flex-wrap gap-2">
                {values.map((value) => (
                    <TabButton
                        key={value}
                        size="sm"
                        active={selected.includes(value)}
                        onClick={() => onToggle(value)}
                    >
                        {labels[value]}
                    </TabButton>
                ))}
            </div>
        </div>
    );
}

function AppsPage() {
    const search = Route.useSearch();
    const { q } = search;
    const category = listOf(APP_CATEGORIES, search.category);
    const platform = listOf(APP_PLATFORMS, search.platform);
    const signal = listOf(APP_SIGNALS, search.signal);
    const navigate = useNavigate({ from: Route.fullPath });
    const { data: apps, loading, failed } = useAppDirectory();

    const spotlight = useMemo(
        () =>
            SPOTLIGHT.map((name) =>
                apps.find(
                    (app) => app.name.toLowerCase() === name.toLowerCase(),
                ),
            ).filter((app): app is DirectoryApp => app !== undefined),
        [apps],
    );

    /** Within an axis it's OR; across axes it's AND. An empty axis is no constraint. */
    const filtered = useMemo(() => {
        const needle = q?.toLowerCase();
        return apps
            .filter((app) => {
                if (category.length) {
                    const own = app.category?.toLowerCase();
                    if (!category.some((c) => c === own)) return false;
                }
                if (platform.length) {
                    const own = platformsOf(app);
                    if (!platform.some((p) => own.includes(p))) return false;
                }
                if (signal.length && !signal.some((s) => SIGNAL_TEST[s](app))) {
                    return false;
                }
                if (
                    needle &&
                    !`${app.name} ${app.description}`
                        .toLowerCase()
                        .includes(needle)
                ) {
                    return false;
                }
                return true;
            })
            .slice()
            .sort(sortApps);
    }, [apps, category, platform, signal, q]);

    const hasFilters = Boolean(
        category.length || platform.length || signal.length || q,
    );
    // resetScroll: false — the filters sit halfway down, and jumping to the
    // top on every pill click made combining them unusable.
    const clear = () => navigate({ resetScroll: false, search: {} });
    const toggleAxis = (key: keyof AppSearch, value: string) =>
        navigate({
            resetScroll: false,
            search: (prev) => ({ ...prev, [key]: toggle(prev[key], value) }),
        });

    const [lead, ...strip] = spotlight;

    return (
        <>
            {/* The nomnom, buried under a stack of apps. "Submit your app"
                moves below the subtitle rather than sitting top-right, so the
                right side belongs to the character — the same shape as Hello. */}
            <Hero character="/characters/apps.png">
                <PageHeader
                    eyebrow={
                        loading
                            ? "Apps built on Pollinations"
                            : `${apps.length} apps built on Pollinations`
                    }
                    title="Ecosystem"
                    subtitle="Apps, tools and experiments from the community. Browse, try, ship."
                />
                <div className="flex flex-wrap gap-3">
                    <ActionButton href="https://github.com/pollinations/pollinations/issues/new?template=APP-SUBMISSION.yml">
                        Submit your app
                    </ActionButton>
                </div>
            </Hero>

            {/* The hero pair: what we made, then the best of what you made. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-5">
                <AppHero
                    href="/play"
                    title="Playground"
                    badge="Official"
                    badgeTone="accent"
                    description="Every model in the browser — text, image, audio, video. Sign in and generate on your own Pollen, nothing to install."
                    meta="pollinations.ai/play"
                    image={appCover("Pollinations Playground")}
                    action={<OpenPill>Open →</OpenPill>}
                />
                {lead && (
                    <AppHero
                        href={lead.web_url || lead.github_repository_url}
                        title={lead.name}
                        badge={isBuzz(lead) ? "Buzz" : "Picked"}
                        description={lead.description}
                        meta={
                            lead.github_username
                                ? `by ${lead.github_username}`
                                : "community built"
                        }
                        image={appCover(lead.name)}
                        action={
                            <span className="text-sm font-semibold text-theme-text-soft">
                                Open ↗
                            </span>
                        }
                    />
                )}
            </div>

            {strip.length > 0 && (
                <ScrollStrip label="Spotlight · picked by hand">
                    {strip.map((app) => (
                        <AppTile
                            key={app.name}
                            app={app}
                            imageClassName="h-30"
                            className="w-59 flex-none"
                        />
                    ))}
                </ScrollStrip>
            )}

            <PixelRule />

            <section className="flex flex-col gap-5">
                <SectionHeader
                    eyebrow="Browse"
                    title="Everything else."
                    subtitle="Combine as many as you like. Badges are automatic — 🐝 busy this week, 🏵️ runs on your Pollen, 🫧 new this month."
                    action={
                        !loading && (
                            <PixelLabel variant="eyebrow">
                                {filtered.length} of {apps.length}
                            </PixelLabel>
                        )
                    }
                />

                <div className="flex flex-col gap-3">
                    <FilterAxis
                        label="Category"
                        values={APP_CATEGORIES}
                        labels={CATEGORY_LABELS}
                        selected={category}
                        onToggle={(value) => toggleAxis("category", value)}
                    />
                    {/* "Badges" is the page's own word for them, one line
                        above. "Signals" is the internal name in
                        app-update-greenhouse.js and means nothing here. */}
                    <FilterAxis
                        label="Badges"
                        values={APP_SIGNALS}
                        labels={SIGNAL_LABELS}
                        selected={signal}
                        onToggle={(value) => toggleAxis("signal", value)}
                    />
                    <FilterAxis
                        label="Platform"
                        values={APP_PLATFORMS}
                        labels={PLATFORM_LABELS}
                        selected={platform}
                        onToggle={(value) => toggleAxis("platform", value)}
                    />
                    {hasFilters && (
                        <button
                            type="button"
                            className="self-start text-sm font-semibold text-theme-text-soft underline"
                            onClick={clear}
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                {failed ? (
                    <p className="text-theme-text-base">
                        The app catalogue could not be loaded. Please try again.
                    </p>
                ) : loading ? (
                    <p className="text-theme-text-muted">Loading apps…</p>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-theme-border border-dashed p-12 text-center text-theme-text-muted">
                        No apps match that combination yet.{" "}
                        <button
                            type="button"
                            className="font-semibold text-theme-text-soft underline"
                            onClick={clear}
                        >
                            Clear filters
                        </button>
                    </div>
                ) : (
                    <>
                        <CardGrid gap="gap-4">
                            {filtered.slice(0, 60).map((app) => (
                                <AppCard key={app.name} app={app} />
                            ))}
                        </CardGrid>
                        {filtered.length > 60 && (
                            <p className="text-center text-sm text-theme-text-muted">
                                Showing the first 60 of {filtered.length}.
                            </p>
                        )}
                    </>
                )}
            </section>
        </>
    );
}
