import { Input, TabButton } from "@pollinations/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
    type DirectoryApp,
    isBuzz,
    isFresh,
    isPollen,
    platformsOf,
    sortApps,
    useAppDirectory,
} from "../data/publicStats";
// Hand-picked, and the only editorial thing on the page — every badge in the
// catalog is computed from traffic or recency, so none can say "we think this
// is good".
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
 * One row of pills on wider screens. On phones the label takes its own line so
 * the controls keep the full content width and remain comfortable touch targets.
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
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-baseline sm:gap-x-3">
            <PixelLabel variant="chrome" className="w-auto shrink-0 sm:w-20">
                {label}
            </PixelLabel>
            <div className="flex w-full flex-wrap gap-2 sm:flex-1">
                {values.map((value) => (
                    <TabButton
                        key={value}
                        size="sm"
                        active={selected.includes(value)}
                        onClick={() => onToggle(value)}
                        className="min-h-11"
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
    // A short first page keeps the one-column phone view browseable; Show more
    // still makes the whole directory reachable without a separate paginator.
    const PAGE = 18;
    const [shown, setShown] = useState(PAGE);
    const visible = filtered.slice(0, shown);

    return (
        <>
            {/* The nomnom, buried under a stack of apps. "Submit your app"
                moves below the subtitle rather than sitting top-right, so the
                right side belongs to the character — the same shape as Hello. */}
            <Hero scene="/heroes/apps.webp">
                <PageHeader
                    eyebrow={
                        loading
                            ? "Apps built on Pollinations"
                            : `${apps.length} apps built on Pollinations`
                    }
                    title="Ecosystem"
                    subtitle={
                        <>
                            What the community ships on the same API you get —{" "}
                            <strong>
                                from weekend experiments to apps with real users
                            </strong>
                            . Browse, try, ship your own.
                        </>
                    }
                />
                <div className="flex flex-wrap gap-3">
                    <ActionButton href="https://github.com/pollinations/pollinations/issues/new?template=APP-SUBMISSION.yml">
                        Submit your app
                    </ActionButton>
                </div>
            </Hero>

            {/* Hand-picked is a section like Browse is a section — it was
                the only block on the page without a title. */}
            <section className="flex flex-col gap-5">
                <SectionHeader
                    eyebrow="Spotlight"
                    title="Picked by hand."
                    subtitle="Not the busiest — the ones we'd actually send a friend to."
                />

                {/* The hero pair: what we made, then the best of what you made. */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-5">
                    <AppHero
                        href="/play"
                        title="Playground"
                        badge="Official"
                        badgeTone="accent"
                        description="Official text, image, audio and video models in the browser. Sign in and generate with your own Pollen — nothing to install."
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
                            image={appCover(lead.name, lead.screenshot_url)}
                            action={
                                <span className="text-sm font-semibold text-theme-text-soft">
                                    Open ↗
                                </span>
                            }
                        />
                    )}
                </div>

                {strip.length > 0 && (
                    <ScrollStrip ariaLabel="More hand-picked apps">
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
            </section>

            <PixelRule />

            <section className="flex flex-col gap-5">
                <SectionHeader
                    eyebrow="Browse"
                    title="Everything else."
                    subtitle="Filters stack. Badges are automatic — 🐝 100+ requests in the last 24 hours, 🏵️ runs on your Pollen, 🫧 new this month."
                    action={
                        !loading && (
                            <PixelLabel variant="eyebrow">
                                {filtered.length} of {apps.length}
                            </PixelLabel>
                        )
                    }
                />

                <div className="flex flex-col gap-3">
                    {/* `q` was validated, round-tripped through the URL and
                        filtered on, with nothing able to set it — the search
                        worked only if you hand-edited the address bar. */}
                    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-baseline sm:gap-x-3">
                        <PixelLabel
                            variant="chrome"
                            className="w-auto shrink-0 sm:w-20"
                        >
                            Search
                        </PixelLabel>
                        <Input
                            type="search"
                            value={q ?? ""}
                            placeholder="Name or description…"
                            aria-label="Search apps"
                            onChange={(event) =>
                                navigate({
                                    resetScroll: false,
                                    search: (prev) => ({
                                        ...prev,
                                        q:
                                            event.target.value.trim() ||
                                            undefined,
                                    }),
                                })
                            }
                            className="min-h-11 w-full max-w-xs sm:flex-1"
                        />
                    </div>
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
                            {visible.map((app) => (
                                <AppCard key={app.name} app={app} />
                            ))}
                        </CardGrid>
                        {filtered.length > visible.length && (
                            <div className="flex flex-col items-center gap-2">
                                <ActionButton
                                    as="button"
                                    tone="plain"
                                    onClick={() => setShown((n) => n + PAGE)}
                                >
                                    Show more
                                </ActionButton>
                                <p className="text-sm text-theme-text-muted">
                                    {visible.length} of {filtered.length}
                                </p>
                            </div>
                        )}
                    </>
                )}
            </section>
        </>
    );
}
