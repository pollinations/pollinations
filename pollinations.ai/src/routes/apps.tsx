import { TabButton } from "@pollinations/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
    type DirectoryApp,
    formatStars,
    githubProfileUrl,
    isBuzz,
    isFresh,
    isPollen,
    platformsOf,
    sortApps,
    useAppDirectory,
} from "../data/publicStats";
import {
    ActionButton,
    ArrowLink,
    Card,
    CardGrid,
    PageHeader,
    PixelLabel,
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

/**
 * Hand-picked. Every badge in APPS.md is computed from traffic or recency, so
 * none of them can say "we think this is good". Until APPS.md grows a Featured
 * column, curation lives here — matched on Name, missing entries just don't
 * render.
 */
const SPOTLIGHT = [
    "LLM Playground",
    "Sirius Cybernetics Elevator Challenge",
    "Strudel AI REPL",
    "CatGPT Meme Generator",
    "Convince the CRAZY Idol to let you free",
    "excelformula.pro",
];

const SIGNAL_TEST = { buzz: isBuzz, pollen: isPollen, fresh: isFresh } as const;

function badgesFor(app: DirectoryApp): string {
    return [isBuzz(app) && "🐝", isPollen(app) && "🏵️", isFresh(app) && "🫧"]
        .filter(Boolean)
        .join(" ");
}

function AppCard({ app }: { app: DirectoryApp }) {
    const href = app.web_url || app.github_repository_url;
    const stars = formatStars(app.github_repository_stars);
    const profile = githubProfileUrl(app.github_username);
    const platform = platformsOf(app)[0];

    return (
        <Card className="gap-2 p-5">
            <div className="flex items-start justify-between gap-2">
                <h3 className="font-subheading text-lg text-theme-text-strong">
                    {app.emoji} {app.name}
                </h3>
                <span className="shrink-0 text-sm">{badgesFor(app)}</span>
            </div>
            <p className="text-sm leading-relaxed text-theme-text-base">
                {app.description}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-theme-text-muted">
                {profile && (
                    <a href={profile} className="hover:text-theme-text-strong">
                        {app.github_username}
                    </a>
                )}
                {stars && <span>⭐ {stars}</span>}
                {platform && <span>· {platform}</span>}
                {href && (
                    <ArrowLink href={href} className="ml-auto text-xs">
                        Open
                    </ArrowLink>
                )}
            </div>
        </Card>
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

    return (
        <>
            {/* Spotlight is the page header. A page title plus two section
                titles was three levels of heading saying the same thing. */}
            <PageHeader
                eyebrow="Spotlight"
                title="Worth your time."
                subtitle="Picked by hand. Not the busiest — the ones we'd actually send a friend to."
                action={
                    <ActionButton href="https://github.com/pollinations/pollinations/issues/new?template=APP-SUBMISSION.yml">
                        Submit your app
                    </ActionButton>
                }
            />

            {spotlight.length > 0 && (
                <CardGrid gap="gap-4">
                    {spotlight.map((app) => (
                        <AppCard key={app.name} app={app} />
                    ))}
                </CardGrid>
            )}

            <section className="flex flex-col gap-5">
                <SectionHeader
                    eyebrow="Browse"
                    title={loading ? "Everything else." : `All ${apps.length}.`}
                    subtitle="Combine as many as you like. Badges are automatic — 🐝 busy this week, 🏵️ runs on your Pollen, 🫧 new this month."
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
                </div>

                {failed ? (
                    <p className="text-theme-text-base">
                        The app catalogue could not be loaded. Please try again.
                    </p>
                ) : loading ? (
                    <p className="text-theme-text-muted">Loading apps…</p>
                ) : filtered.length === 0 ? (
                    <p className="text-theme-text-base">
                        No apps match that combination yet.{" "}
                        <button
                            type="button"
                            className="font-semibold text-theme-text-soft underline"
                            onClick={clear}
                        >
                            Clear filters
                        </button>
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-theme-text-muted">
                            {filtered.length} of {apps.length}
                            {hasFilters && (
                                <>
                                    {" · "}
                                    <button
                                        type="button"
                                        className="font-semibold text-theme-text-soft underline"
                                        onClick={clear}
                                    >
                                        Clear filters
                                    </button>
                                </>
                            )}
                        </p>
                        <CardGrid gap="gap-4">
                            {filtered.slice(0, 60).map((app) => (
                                <AppCard key={app.name} app={app} />
                            ))}
                        </CardGrid>
                        {filtered.length > 60 && (
                            <p className="text-sm text-theme-text-muted">
                                Showing the first 60 of {filtered.length}.
                            </p>
                        )}
                    </>
                )}
            </section>
        </>
    );
}
