import {
    AppIcon,
    Button,
    ChevronIcon,
    Chip,
    ClockIcon,
    ContentHeader,
    cn,
    Dropdown,
    EditableCombobox,
    EditableComboboxToken,
    ExternalLinkButton,
    PlusIcon,
    SearchIcon,
    Surface,
    TabButton,
    TrendUpIcon,
} from "@pollinations/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useMemo, useState } from "react";
import {
    appIdentity,
    compareAppUsage,
    type DirectoryApp,
    isPollen,
    platformsOf,
    useAppDirectory,
    useWeeklyApps,
} from "../data/publicStats";
import { routeHead } from "../routeMeta";
import { SpotlightCarousel } from "../ui/apps/AppCarousel";
import { AppRow } from "../ui/apps/cards";
import { BottomScene } from "../ui/site/BottomScene";
import { HeroScene, postHeroSpacingClassName } from "../ui/site/HeroScene";
import {
    APP_CATEGORIES,
    APP_PLATFORMS,
    APP_SORTS,
    type AppPlatform,
    type AppSearch,
    type AppSort,
    CATEGORY_LABELS,
    PLATFORM_LABELS,
    validateAppSearch,
} from "./-app-search";

export const Route = createFileRoute("/apps")({
    head: () => routeHead("/apps"),
    validateSearch: validateAppSearch,
    component: AppsPage,
});

const SORT_LABELS: Record<AppSort, string> = {
    fresh: "New",
    buzz: "Popular",
};

const SORT_ICONS = {
    fresh: ClockIcon,
    buzz: TrendUpIcon,
} satisfies Record<AppSort, typeof ClockIcon>;

const newestFirst = (a: DirectoryApp, b: DirectoryApp) =>
    (b.approved_date || "").localeCompare(a.approved_date || "");

/** Every ranking falls back to freshness, then name for a stable final order. */
function compareApps(sort: AppSort) {
    return (a: DirectoryApp, b: DirectoryApp) => {
        if (sort === "buzz") {
            const traffic = compareAppUsage(a, b);
            if (traffic) return traffic;
        }
        return newestFirst(a, b) || a.name.localeCompare(b.name);
    };
}

function FilterAxis<T extends string>({
    ariaLabel,
    values,
    labels,
    selected,
    onClear,
    onSelect,
}: {
    ariaLabel: string;
    values: readonly T[];
    labels: Record<T, string>;
    selected: T | undefined;
    onClear: () => void;
    onSelect: (value: T) => void;
}) {
    return (
        <fieldset
            className="m-0 flex min-w-0 flex-1 flex-wrap gap-2 border-0 p-0"
            aria-label={ariaLabel}
        >
            <TabButton
                size="lg"
                active={selected === undefined}
                onClick={onClear}
            >
                All
            </TabButton>
            {values.map((value) => (
                <TabButton
                    key={value}
                    size="lg"
                    active={selected === value}
                    onClick={() => onSelect(value)}
                >
                    {labels[value]}
                </TabButton>
            ))}
        </fieldset>
    );
}

type AppFilterKey = "platform" | "pollen-pay";
type AppFilterDraft = {
    key: AppFilterKey;
    value: string;
    editingPlatform?: AppPlatform;
};

const APP_FILTER_LABELS: Record<AppFilterKey, string> = {
    platform: "Platform",
    "pollen-pay": "Pollen Pay",
};

function AppSearchInput({
    query,
    platforms,
    pollenPay,
    onQueryChange,
    onPlatformsChange,
    onPollenPayChange,
}: {
    query: string;
    platforms: AppPlatform[];
    pollenPay: boolean | undefined;
    onQueryChange: (query: string) => void;
    onPlatformsChange: (platforms: AppPlatform[]) => void;
    onPollenPayChange: (pollenPay: boolean | undefined) => void;
}) {
    const [draft, setDraft] = useState<AppFilterDraft>();
    const [pendingRemoval, setPendingRemoval] = useState<string>();
    const [open, setOpen] = useState(false);

    const visibleSearch = draft?.value ?? query;
    const availablePlatforms = APP_PLATFORMS.filter(
        (value) =>
            value === draft?.editingPlatform || !platforms.includes(value),
    );
    const options = draft
        ? draft.key === "platform"
            ? availablePlatforms.map((value) => PLATFORM_LABELS[value])
            : ["Yes", "No"]
        : (() => {
              const tokenStart = query.lastIndexOf(" ") + 1;
              const prefix = query.slice(0, tokenStart);
              const token = query.slice(tokenStart).toLowerCase();
              const availableKeys: AppFilterKey[] = [
                  ...(platforms.length < APP_PLATFORMS.length
                      ? (["platform"] as const)
                      : []),
                  ...(pollenPay === undefined ? (["pollen-pay"] as const) : []),
              ];
              return availableKeys
                  .filter((key) => `${key}:`.startsWith(token))
                  .map((key) => `${prefix}${key}:`);
          })();

    const findPlatform = (value: string) =>
        APP_PLATFORMS.find(
            (platform) =>
                platform === value.trim().toLowerCase() ||
                PLATFORM_LABELS[platform].toLowerCase() ===
                    value.trim().toLowerCase(),
        );

    const resetDraft = () => {
        setDraft(undefined);
        setPendingRemoval(undefined);
        setOpen(false);
    };

    const commitFilter = (nextDraft: AppFilterDraft, value: string) => {
        if (nextDraft.key === "platform") {
            const selected = findPlatform(value);
            if (!selected) return false;
            const next = platforms.filter(
                (platform) => platform !== nextDraft.editingPlatform,
            );
            if (!next.includes(selected)) next.push(selected);
            onPlatformsChange(next);
        } else {
            const normalized = value.trim().toLowerCase();
            if (!["yes", "no", "true", "false"].includes(normalized))
                return false;
            onPollenPayChange(normalized === "yes" || normalized === "true");
        }
        resetDraft();
        return true;
    };

    const handleChange = (next: string) => {
        setPendingRemoval(undefined);
        if (draft) {
            if (!commitFilter(draft, next)) setDraft({ ...draft, value: next });
            return;
        }

        const tokenStart = next.lastIndexOf(" ") + 1;
        const token = next.slice(tokenStart);
        const separator = token.indexOf(":");
        const key = token.slice(0, separator).toLowerCase() as AppFilterKey;
        if (separator < 0 || (key !== "platform" && key !== "pollen-pay")) {
            onQueryChange(next);
            return;
        }

        onQueryChange(next.slice(0, tokenStart).trim());
        const nextDraft = {
            key,
            value: token.slice(separator + 1),
        } satisfies AppFilterDraft;
        if (!commitFilter(nextDraft, nextDraft.value)) {
            setDraft(nextDraft);
            setOpen(true);
        }
    };

    const editPlatform = (value: AppPlatform) => {
        setPendingRemoval(undefined);
        setDraft({ key: "platform", value: "", editingPlatform: value });
        setOpen(true);
    };

    const editPollenPay = () => {
        setPendingRemoval(undefined);
        setDraft({ key: "pollen-pay", value: "" });
        setOpen(true);
    };

    const removeFilter = (id: string) => {
        if (id === "pollen-pay") {
            onPollenPayChange(undefined);
        } else {
            const value = id.slice("platform:".length) as AppPlatform;
            onPlatformsChange(
                platforms.filter((platform) => platform !== value),
            );
        }
    };

    const visiblePlatforms = platforms.filter(
        (platform) => platform !== draft?.editingPlatform,
    );
    const showPollenToken =
        pollenPay !== undefined && draft?.key !== "pollen-pay";
    const pollenLabel = pollenPay ? "Yes" : "No";
    const tokenIds = [
        ...visiblePlatforms.map((platform) => `platform:${platform}`),
        ...(showPollenToken ? ["pollen-pay"] : []),
    ];

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Backspace") {
            setPendingRemoval(undefined);
            return;
        }
        if (visibleSearch !== "") {
            setPendingRemoval(undefined);
            return;
        }

        event.preventDefault();
        if (draft) {
            resetDraft();
            return;
        }

        const lastToken = tokenIds[tokenIds.length - 1];
        if (!lastToken) return;
        if (pendingRemoval === lastToken) {
            removeFilter(lastToken);
            setPendingRemoval(undefined);
        } else {
            setPendingRemoval(lastToken);
        }
    };

    return (
        <EditableCombobox
            value={visibleSearch}
            options={options}
            onChange={handleChange}
            open={open && (Boolean(draft) || options.length > 0)}
            onOpenChange={setOpen}
            onClick={() => setPendingRemoval(undefined)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
                if (draft) resetDraft();
            }}
            placeholder={
                draft
                    ? `${APP_FILTER_LABELS[draft.key]} value…`
                    : "Search apps…"
            }
            aria-label="Search apps"
            autoComplete="off"
            startContent={
                tokenIds.length === 0 && !draft ? (
                    <SearchIcon className="pointer-events-none ml-1 mr-0.5 size-4 shrink-0 text-theme-text-muted" />
                ) : (
                    <>
                        {visiblePlatforms.map((platform) => (
                            <EditableComboboxToken
                                key={platform}
                                label="Platform"
                                value={PLATFORM_LABELS[platform]}
                                highlighted={
                                    pendingRemoval === `platform:${platform}`
                                }
                                aria-label={`Change Platform filter: ${PLATFORM_LABELS[platform]}`}
                                onClick={() => editPlatform(platform)}
                            />
                        ))}
                        {showPollenToken && (
                            <EditableComboboxToken
                                label="Pollen Pay"
                                value={pollenLabel}
                                highlighted={pendingRemoval === "pollen-pay"}
                                aria-label={`Change Pollen Pay filter: ${pollenLabel}`}
                                onClick={editPollenPay}
                            />
                        )}
                        {draft && (
                            <div className="flex h-7 max-w-full shrink-0 items-center text-xs">
                                <span className="py-1 pl-1.5 pr-1 text-theme-text-muted">
                                    {APP_FILTER_LABELS[draft.key]}:
                                </span>
                            </div>
                        )}
                    </>
                )
            }
        />
    );
}

function AppsPage() {
    const search = Route.useSearch();
    const { q, category, pollen: pollenPay } = search;
    // validateAppSearch has already whitelisted every platform in the URL.
    const platform = useMemo(
        () => (search.platform?.split(",") ?? []) as AppPlatform[],
        [search.platform],
    );
    const sort = search.sort ?? "fresh";
    const navigate = useNavigate({ from: Route.fullPath });
    const { data: apps, loading, failed } = useAppDirectory();

    const { data: spotlight, loading: spotlightLoading } = useWeeklyApps();

    /** Within an axis it's OR; across axes it's AND. An empty axis is no constraint. */
    const filtered = useMemo(() => {
        const needle = q?.toLowerCase();
        return apps
            .filter((app) => {
                if (category) {
                    const own = app.category?.toLowerCase();
                    if (category !== own) return false;
                }
                if (platform.length) {
                    const own = platformsOf(app);
                    if (!platform.some((p) => own.includes(p))) return false;
                }
                if (pollenPay !== undefined && isPollen(app) !== pollenPay) {
                    return false;
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
            .sort(compareApps(sort));
    }, [apps, category, platform, pollenPay, q, sort]);

    // replace: true — filter changes refine one view, not a history of
    // keystrokes. resetScroll: false — the filters sit halfway down, and
    // jumping to the top on every selection made combining them unusable.
    const updateSearch = (patch: AppSearch) =>
        navigate({
            replace: true,
            resetScroll: false,
            search: (prev) => ({ ...prev, ...patch }),
        });

    // A short first page keeps the one-column phone view browseable; Show more
    // still makes the whole directory reachable without a separate paginator.
    const PAGE = 18;
    const [shown, setShown] = useState(PAGE);
    const visible = filtered.slice(0, shown);

    return (
        <>
            <HeroScene page="apps">
                <ContentHeader
                    eyebrow="Community catalog"
                    title="Apps"
                    subtitle={
                        <>
                            Explore what the community builds with
                            Pollinations—from{" "}
                            <strong>
                                creative weekend experiments to apps used at
                                scale
                            </strong>
                            .
                        </>
                    }
                    variant="page"
                />
                <div className="flex flex-col items-start gap-3">
                    <span className="font-semibold text-sm text-theme-text-strong">
                        Built something with Pollinations?
                    </span>
                    <ExternalLinkButton
                        href="https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml"
                        intent="brand"
                        size="lg"
                        icon={<PlusIcon className="size-4 shrink-0" />}
                        className="self-start"
                    >
                        List your app
                    </ExternalLinkButton>
                </div>
            </HeroScene>

            {(spotlightLoading || spotlight.length > 0) && (
                <Surface
                    as="section"
                    variant="card"
                    className={cn(
                        "overflow-hidden p-0",
                        postHeroSpacingClassName,
                    )}
                >
                    <div className="px-5 pt-5 pb-5 sm:px-6 sm:pt-6">
                        <ContentHeader
                            eyebrow="Last 7 days"
                            title="Most-used Pollen Pay apps"
                            subtitle="Ranked by successful, billable requests through Pollen Pay."
                        />
                    </div>
                    {spotlightLoading ? (
                        <div
                            aria-hidden="true"
                            className="flex flex-col border-theme-text-strong/10 border-t"
                        >
                            <div className="aspect-[16/7] animate-pulse bg-theme-bg-subtle sm:aspect-[18/7]" />
                            <div className="flex flex-col gap-2 px-5 py-4">
                                <div className="h-6 w-48 max-w-full animate-pulse rounded bg-theme-bg-subtle" />
                                <div className="h-10 animate-pulse rounded bg-theme-bg-subtle" />
                            </div>
                        </div>
                    ) : (
                        <SpotlightCarousel apps={spotlight} />
                    )}
                </Surface>
            )}

            <section
                className={cn(
                    "flex flex-col gap-5",
                    !spotlightLoading &&
                        spotlight.length === 0 &&
                        postHeroSpacingClassName,
                )}
            >
                <ContentHeader eyebrow="Directory" title="All apps" />

                <div className="flex flex-col items-start gap-3">
                    <FilterAxis
                        ariaLabel="Categories"
                        values={APP_CATEGORIES}
                        labels={CATEGORY_LABELS}
                        selected={category}
                        onClear={() => updateSearch({ category: undefined })}
                        onSelect={(value) => updateSearch({ category: value })}
                    />

                    <div className="flex w-full flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 max-w-md flex-1 basis-[280px]">
                            <AppSearchInput
                                query={q ?? ""}
                                platforms={platform}
                                pollenPay={pollenPay}
                                onQueryChange={(next) =>
                                    updateSearch({
                                        q: next.trim() || undefined,
                                    })
                                }
                                onPlatformsChange={(next) =>
                                    updateSearch({
                                        platform:
                                            next.length > 0
                                                ? next.join(",")
                                                : undefined,
                                    })
                                }
                                onPollenPayChange={(next) =>
                                    updateSearch({ pollen: next })
                                }
                            />
                        </div>

                        <div className="flex min-h-11 items-center gap-3">
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
                                className="min-w-40 p-1"
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
                                    <div className="flex flex-col gap-1">
                                        {APP_SORTS.map((value) => {
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
                                                        updateSearch({
                                                            sort:
                                                                value ===
                                                                "fresh"
                                                                    ? undefined
                                                                    : value,
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
                        No apps match that combination yet.
                    </div>
                ) : (
                    <>
                        <div className="border-t border-transparent">
                            {visible.map((app) => (
                                <AppRow key={appIdentity(app)} app={app} />
                            ))}
                        </div>
                        {filtered.length > visible.length && (
                            <div className="flex flex-col items-center gap-2">
                                <Button
                                    intent="neutral"
                                    size="lg"
                                    onClick={() => setShown((n) => n + PAGE)}
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
            <BottomScene page="apps" />
        </>
    );
}
