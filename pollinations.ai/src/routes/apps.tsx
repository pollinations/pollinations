import {
    AppIcon,
    Button,
    ChevronIcon,
    Chip,
    ClockIcon,
    ContentHeader,
    cn,
    Dropdown,
    Input,
    MultiSelect,
    TabButton,
    TrendUpIcon,
    WalletIcon,
} from "@pollinations/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
    type DirectoryApp,
    isPollen,
    platformsOf,
    useAppDirectory,
} from "../data/publicStats";
// Hand-picked, and the only editorial thing on the page — every badge in
// catalog.json is computed from traffic or recency, so none of them can say "we
// think this is good". JSON because scripts/generate-app-art.mjs reads the
// same list to decide which apps get cover art.
import SPOTLIGHT from "../data/spotlight.json";
import { routeHead } from "../routeMeta";
import { AppCarousel } from "../ui/apps/AppCarousel";
import { AppRow } from "../ui/apps/cards";
import { BottomScene } from "../ui/site/BottomScene";
import { HeroScene, postHeroSpacingClassName } from "../ui/site/HeroScene";
import {
    APP_CATEGORIES,
    APP_PLATFORMS,
    type AppSort,
    CATEGORY_LABELS,
    listOf,
    PLATFORM_LABELS,
    toggle,
    validateAppSearch,
} from "./-app-search";

export const Route = createFileRoute("/apps")({
    head: () => routeHead("/apps"),
    validateSearch: validateAppSearch,
    component: AppsPage,
});

const SORT_LABELS: Record<AppSort, string> = {
    fresh: "Fresh",
    buzz: "Buzz",
    pollen: "Pollen",
};

const SORT_ICONS = {
    fresh: ClockIcon,
    buzz: TrendUpIcon,
    pollen: WalletIcon,
} satisfies Record<AppSort, typeof ClockIcon>;

const newestFirst = (a: DirectoryApp, b: DirectoryApp) =>
    (b.approved_date || "").localeCompare(a.approved_date || "");

/** Every ranking falls back to freshness, then name for a stable final order. */
function compareApps(sort: AppSort) {
    return (a: DirectoryApp, b: DirectoryApp) => {
        if (sort === "buzz") {
            const traffic = Number(b.requests_24h) - Number(a.requests_24h);
            if (traffic) return traffic;
        }
        if (sort === "pollen" && isPollen(a) !== isPollen(b)) {
            return isPollen(a) ? -1 : 1;
        }
        return newestFirst(a, b) || a.name.localeCompare(b.name);
    };
}

function FilterAxis<T extends string>({
    ariaLabel,
    values,
    labels,
    selected,
    onToggle,
    size = "sm",
}: {
    ariaLabel: string;
    values: readonly T[];
    labels: Record<T, string>;
    selected: T[];
    onToggle: (value: T) => void;
    size?: "lg" | "md" | "sm";
}) {
    return (
        <fieldset
            className="m-0 flex min-w-0 w-full flex-wrap gap-2 border-0 p-0"
            aria-label={ariaLabel}
        >
            {values.map((value) => (
                <TabButton
                    key={value}
                    size={size}
                    active={selected.includes(value)}
                    onClick={() => onToggle(value)}
                    className="min-h-11"
                >
                    {labels[value]}
                </TabButton>
            ))}
        </fieldset>
    );
}

function AppsPage() {
    const search = Route.useSearch();
    const { q } = search;
    const category = listOf(APP_CATEGORIES, search.category);
    const platform = listOf(APP_PLATFORMS, search.platform);
    const sort = search.sort ?? "fresh";
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
                if (
                    needle &&
                    !`${app.name} ${app.description} ${app.github_username}`
                        .toLowerCase()
                        .includes(needle)
                ) {
                    return false;
                }
                return true;
            })
            .slice()
            .sort(compareApps(sort));
    }, [apps, category, platform, q, sort]);

    const hasFilters = Boolean(category.length || platform.length || q);
    // resetScroll: false — the filters sit halfway down, and jumping to the
    // top on every pill click made combining them unusable.
    const clear = () =>
        navigate({
            resetScroll: false,
            search: search.sort ? { sort: search.sort } : {},
        });
    const toggleCategory = (value: string) =>
        navigate({
            resetScroll: false,
            search: (prev) => ({
                ...prev,
                category: toggle(prev.category, value),
            }),
        });

    // A short first page keeps the one-column phone view browseable; Show more
    // still makes the whole directory reachable without a separate paginator.
    const PAGE = 18;
    const [shown, setShown] = useState(PAGE);
    const visible = filtered.slice(0, shown);

    return (
        <>
            <HeroScene
                scene="/heroes/apps.webp"
                nightScene="/heroes/apps-top-night.webp"
            >
                <ContentHeader
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
                    variant="page"
                />
                <div className="flex flex-wrap items-center gap-4">
                    <span className="font-semibold text-sm text-theme-text-strong">
                        Built something with Pollinations?
                    </span>
                    <Button
                        as="a"
                        href="https://github.com/pollinations/pollinations/issues/new?template=APP-SUBMISSION.yml"
                        appearance="raised"
                    >
                        Share your App
                    </Button>
                </div>
            </HeroScene>

            {spotlight.length > 0 && (
                <AppCarousel
                    apps={spotlight}
                    className={postHeroSpacingClassName}
                />
            )}

            <section
                className={cn(
                    "flex flex-col gap-5",
                    spotlight.length === 0 && postHeroSpacingClassName,
                )}
            >
                <ContentHeader
                    eyebrow="Directory"
                    title="Browse them all"
                    subtitle="Explore apps built with Pollinations, from creative experiments to tools people use every day."
                />

                <div className="flex flex-col gap-3">
                    <Input
                        type="search"
                        value={q ?? ""}
                        placeholder="Search by app, description or creator…"
                        aria-label="Search apps"
                        onChange={(event) =>
                            navigate({
                                resetScroll: false,
                                search: (prev) => ({
                                    ...prev,
                                    q: event.target.value.trim() || undefined,
                                }),
                            })
                        }
                        className="mb-2 min-h-11 w-full max-w-xl"
                    />
                    <FilterAxis
                        ariaLabel="Categories"
                        values={APP_CATEGORIES}
                        labels={CATEGORY_LABELS}
                        selected={category}
                        onToggle={toggleCategory}
                        size="lg"
                    />
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                        <MultiSelect
                            placeholder="All platforms"
                            options={APP_PLATFORMS.map((value) => ({
                                value,
                                label: PLATFORM_LABELS[value],
                            }))}
                            selected={platform}
                            onChange={(next) =>
                                navigate({
                                    resetScroll: false,
                                    search: (prev) => ({
                                        ...prev,
                                        platform:
                                            next.length > 0
                                                ? next.join(",")
                                                : undefined,
                                    }),
                                })
                            }
                        />

                        {hasFilters && (
                            <Button size="sm" type="button" onClick={clear}>
                                Clear filters
                            </Button>
                        )}

                        <div className="ml-auto flex min-h-11 items-center gap-3">
                            {!loading && (
                                <Chip
                                    size="lg"
                                    aria-live="polite"
                                    className="gap-1.5 bg-theme-bg-subtle px-3 text-theme-text-soft"
                                >
                                    <AppIcon className="size-4" />
                                    <span className="tabular-nums">
                                        {filtered.length === apps.length
                                            ? `${apps.length} apps`
                                            : `${filtered.length} / ${apps.length} apps`}
                                    </span>
                                </Chip>
                            )}
                            <Dropdown
                                align="end"
                                className="polli:min-w-40 polli:p-1"
                                trigger={(open) => {
                                    const SortIcon = SORT_ICONS[sort];
                                    return (
                                        <Button
                                            type="button"
                                            size="sm"
                                            aria-label={`Sort apps: ${SORT_LABELS[sort]}`}
                                            className="min-h-8 gap-2 whitespace-nowrap px-3 py-1.5 text-xs"
                                        >
                                            <SortIcon className="size-4 shrink-0" />
                                            {SORT_LABELS[sort]}
                                            <ChevronIcon
                                                expanded={open}
                                                className="size-3 shrink-0"
                                            />
                                        </Button>
                                    );
                                }}
                            >
                                {(close) => (
                                    <div className="polli:flex polli:flex-col polli:gap-1">
                                        {(
                                            Object.keys(
                                                SORT_LABELS,
                                            ) as AppSort[]
                                        ).map((value) => {
                                            const OptionIcon =
                                                SORT_ICONS[value];
                                            return (
                                                <TabButton
                                                    key={value}
                                                    active={sort === value}
                                                    size="sm"
                                                    variant="ghost"
                                                    className="w-full justify-start gap-2"
                                                    onClick={() => {
                                                        navigate({
                                                            resetScroll: false,
                                                            search: (prev) => ({
                                                                ...prev,
                                                                sort:
                                                                    value ===
                                                                    "fresh"
                                                                        ? undefined
                                                                        : value,
                                                            }),
                                                        });
                                                        close();
                                                    }}
                                                >
                                                    <OptionIcon className="size-4 shrink-0" />
                                                    {SORT_LABELS[value]}
                                                </TabButton>
                                            );
                                        })}
                                    </div>
                                )}
                            </Dropdown>
                        </div>
                    </div>
                </div>

                {failed ? (
                    <p className="text-theme-text-base">
                        The app directory couldn’t be loaded right now.
                    </p>
                ) : loading ? (
                    <p className="text-theme-text-muted">Loading apps…</p>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-theme-border border-dashed p-12 text-center text-theme-text-muted">
                        No apps match that combination yet.{" "}
                        <Button size="sm" type="button" onClick={clear}>
                            Clear filters
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="border-theme-border/70 border-t">
                            {visible.map((app) => (
                                <AppRow key={app.name} app={app} />
                            ))}
                        </div>
                        {filtered.length > visible.length && (
                            <div className="flex flex-col items-center gap-2">
                                <Button
                                    appearance="raised"
                                    onClick={() => setShown((n) => n + PAGE)}
                                    className="bg-surface-opaque"
                                >
                                    Show more
                                </Button>
                                <p className="text-sm text-theme-text-muted">
                                    {visible.length} of {filtered.length}
                                </p>
                            </div>
                        )}
                    </>
                )}
            </section>
            <BottomScene
                dayScene="/heroes/apps-bottom-day.webp"
                nightScene="/heroes/apps-bottom-night.webp"
            />
        </>
    );
}
