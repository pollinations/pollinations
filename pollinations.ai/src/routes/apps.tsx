import {
    BookIcon,
    Button,
    ButtonGroup,
    ExternalLinkButton,
    RocketIcon,
    Section,
    Surface,
    TabButton,
} from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppCard } from "../components/apps/AppCard.tsx";
import {
    APP_LINKS,
    APPS_COPY,
    APPS_META,
    CATEGORY_FILTER_IDS,
    CATEGORY_FILTERS,
    PLATFORM_FILTER_IDS,
    PLATFORM_FILTERS,
    SIGNAL_FILTER_IDS,
    SIGNAL_FILTERS,
} from "../components/apps/copy.ts";
import { type AppFilters, loadApps, selectApps } from "../lib/apps.ts";

function parseSearchList<T extends string>(
    value: unknown,
    allowedValues: readonly T[],
): T[] {
    const rawValue = Array.isArray(value)
        ? value.filter((item) => typeof item === "string").join(",")
        : typeof value === "string"
          ? value
          : "";
    const allowed = new Set<string>(allowedValues);
    const selected: T[] = [];

    for (const item of rawValue.split(",")) {
        const normalized = item.trim().toLowerCase();
        if (!allowed.has(normalized)) continue;

        const typedValue = normalized as T;
        if (!selected.includes(typedValue)) {
            selected.push(typedValue);
        }
    }

    return selected;
}

function normalizeSearchList<T extends string>(
    value: unknown,
    allowedValues: readonly T[],
): string | undefined {
    return encodeSearchList(parseSearchList(value, allowedValues));
}

function encodeSearchList(selected: string[]): string | undefined {
    return selected.length > 0 ? selected.join(",") : undefined;
}

function toggleSelection<T extends string>(selected: T[], value: T): T[] {
    return selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value];
}

export const Route = createFileRoute("/apps")({
    validateSearch: (search: Record<string, unknown>) => ({
        category: normalizeSearchList(search.category, CATEGORY_FILTER_IDS),
        platform: normalizeSearchList(search.platform, PLATFORM_FILTER_IDS),
        signal: normalizeSearchList(search.signal, SIGNAL_FILTER_IDS),
    }),
    loader: async () => {
        try {
            return { apps: await loadApps(), error: "" };
        } catch {
            return {
                apps: [],
                error: "The app directory is temporarily unavailable.",
            };
        }
    },
    head: () => ({
        meta: [
            { title: APPS_META.title },
            { name: "description", content: APPS_META.description },
        ],
    }),
    component: AppsPage,
});

function AppsPage() {
    const { apps, error } = Route.useLoaderData();
    const { category, platform, signal } = Route.useSearch();
    const navigate = Route.useNavigate();
    const selectedFilters = useMemo<AppFilters>(
        () => ({
            categories: parseSearchList(category, CATEGORY_FILTER_IDS),
            platforms: parseSearchList(platform, PLATFORM_FILTER_IDS),
            signals: parseSearchList(signal, SIGNAL_FILTER_IDS),
        }),
        [category, platform, signal],
    );
    const selectedApps = useMemo(
        () => selectApps(apps, selectedFilters),
        [apps, selectedFilters],
    );
    const activeFilterCount =
        selectedFilters.categories.length +
        selectedFilters.platforms.length +
        selectedFilters.signals.length;

    const setFilters = (nextFilters: AppFilters) => {
        navigate({
            search: {
                category: encodeSearchList(nextFilters.categories),
                platform: encodeSearchList(nextFilters.platforms),
                signal: encodeSearchList(nextFilters.signals),
            },
        });
    };

    const clearFilters = () => {
        setFilters({ categories: [], platforms: [], signals: [] });
    };

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6">
            <section className="flex flex-col gap-5">
                <div className="flex flex-col gap-3">
                    <h1 className="font-heading text-4xl leading-none text-theme-text-strong sm:text-5xl">
                        {APPS_COPY.title}
                    </h1>
                    <p className="flex flex-col font-body text-lg text-theme-text-base">
                        <span>
                            {APPS_COPY.subtitlePrefix}
                            <strong className="font-semibold text-theme-text-strong">
                                {APPS_COPY.subtitleBold}
                            </strong>
                        </span>
                        <span>{APPS_COPY.subtitleSuffix.trim()}</span>
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Surface
                        variant="card-themed"
                        className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"
                    >
                        <div>
                            <h2 className="font-subheading text-lg text-theme-text-strong">
                                {APPS_COPY.submitCtaTitle}
                            </h2>
                            <p className="mt-1 text-sm text-theme-text-base">
                                {APPS_COPY.submitCtaDescription}
                            </p>
                        </div>
                        <ExternalLinkButton
                            href={APP_LINKS.submitApp}
                            className="shrink-0"
                        >
                            <span className="inline-flex items-center gap-2">
                                <RocketIcon className="h-4 w-4 shrink-0" />
                                {APPS_COPY.submitCtaButton}
                            </span>
                        </ExternalLinkButton>
                    </Surface>

                    <Surface
                        variant="card-themed"
                        className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"
                    >
                        <div>
                            <h2 className="font-subheading text-lg text-theme-text-strong">
                                {APPS_COPY.pollenCtaTitle}
                            </h2>
                            <p className="mt-1 text-sm text-theme-text-base">
                                {APPS_COPY.pollenCtaDescription}
                            </p>
                        </div>
                        <ExternalLinkButton
                            href={APP_LINKS.byopDocs}
                            className="shrink-0"
                        >
                            <span className="inline-flex items-center gap-2">
                                <BookIcon className="h-4 w-4 shrink-0" />
                                {APPS_COPY.pollenCtaButton}
                            </span>
                        </ExternalLinkButton>
                    </Surface>
                </div>
            </section>

            <Section
                id="apps-directory"
                title="Apps"
                framed
                actionClassName="w-full sm:ml-auto sm:w-auto"
                action={
                    <div className="flex flex-wrap items-center gap-2 text-sm text-theme-text-soft">
                        <span>
                            {APPS_COPY.showingLabel}{" "}
                            <strong className="text-theme-text-strong">
                                {selectedApps.length}
                            </strong>{" "}
                            {APPS_COPY.ofLabel}{" "}
                            <strong className="text-theme-text-strong">
                                {apps.length}
                            </strong>{" "}
                            {APPS_COPY.appsLabel}
                        </span>
                        {activeFilterCount > 0 && (
                            <Button
                                type="button"
                                size="sm"
                                onClick={clearFilters}
                            >
                                {APPS_COPY.clearFilters}
                            </Button>
                        )}
                    </div>
                }
            >
                <div className="flex flex-col gap-5 pb-1">
                    <div className="flex min-w-0 flex-col gap-2">
                        <div className="font-body text-sm font-semibold text-theme-text-soft">
                            {APPS_COPY.categoryLabel}
                        </div>
                        <ButtonGroup aria-label={APPS_COPY.categoryLabel}>
                            {CATEGORY_FILTERS.map((item) => (
                                <TabButton
                                    key={item.id}
                                    active={selectedFilters.categories.includes(
                                        item.id,
                                    )}
                                    onClick={() =>
                                        setFilters({
                                            ...selectedFilters,
                                            categories: toggleSelection(
                                                selectedFilters.categories,
                                                item.id,
                                            ),
                                        })
                                    }
                                    size="sm"
                                    variant="ghost"
                                >
                                    {item.label}
                                </TabButton>
                            ))}
                        </ButtonGroup>
                    </div>

                    <div className="flex min-w-0 flex-col gap-2">
                        <div className="font-body text-sm font-semibold text-theme-text-soft">
                            {APPS_COPY.platformLabel}
                        </div>
                        <ButtonGroup aria-label={APPS_COPY.platformLabel}>
                            {PLATFORM_FILTERS.map((item) => (
                                <TabButton
                                    key={item.id}
                                    active={selectedFilters.platforms.includes(
                                        item.id,
                                    )}
                                    onClick={() =>
                                        setFilters({
                                            ...selectedFilters,
                                            platforms: toggleSelection(
                                                selectedFilters.platforms,
                                                item.id,
                                            ),
                                        })
                                    }
                                    size="sm"
                                    variant="ghost"
                                >
                                    {item.label}
                                </TabButton>
                            ))}
                        </ButtonGroup>
                    </div>

                    <div className="flex min-w-0 flex-col gap-2">
                        <div className="font-body text-sm font-semibold text-theme-text-soft">
                            {APPS_COPY.signalLabel}
                        </div>
                        <ButtonGroup aria-label={APPS_COPY.signalLabel}>
                            {SIGNAL_FILTERS.map((item) => (
                                <TabButton
                                    key={item.id}
                                    active={selectedFilters.signals.includes(
                                        item.id,
                                    )}
                                    onClick={() =>
                                        setFilters({
                                            ...selectedFilters,
                                            signals: toggleSelection(
                                                selectedFilters.signals,
                                                item.id,
                                            ),
                                        })
                                    }
                                    size="sm"
                                    variant="ghost"
                                >
                                    {item.label}
                                </TabButton>
                            ))}
                        </ButtonGroup>
                    </div>
                </div>

                {error ? (
                    <Surface className="text-theme-text-base">{error}</Surface>
                ) : selectedApps.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {selectedApps.map((app, index) => (
                            <AppCard
                                key={`${app.name}-${app.githubId || index}`}
                                app={app}
                            />
                        ))}
                    </div>
                ) : (
                    <Surface className="text-center text-theme-text-base">
                        {APPS_COPY.noAppsMessage}
                    </Surface>
                )}
            </Section>
        </div>
    );
}
