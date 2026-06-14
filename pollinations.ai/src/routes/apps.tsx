import {
    ButtonGroup,
    Chip,
    ExternalLinkButton,
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
    BADGE_FILTERS,
    CATEGORY_FILTERS,
    DEFAULT_BADGE_FILTER,
    DEFAULT_CATEGORY_FILTER,
} from "../components/apps/copy.ts";
import {
    isBadgeFilterId,
    isCategoryFilterId,
    loadApps,
    selectApps,
} from "../lib/apps.ts";

export const Route = createFileRoute("/apps")({
    validateSearch: (search: Record<string, unknown>) => ({
        filter: isCategoryFilterId(search.filter)
            ? search.filter
            : DEFAULT_CATEGORY_FILTER,
        sort: isBadgeFilterId(search.sort) ? search.sort : DEFAULT_BADGE_FILTER,
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
    const { filter, sort } = Route.useSearch();
    const navigate = Route.useNavigate();
    const selectedApps = useMemo(
        () => selectApps(apps, filter, sort),
        [apps, filter, sort],
    );

    const setFilter = (nextFilter: typeof filter) => {
        navigate({ search: { filter: nextFilter, sort } });
    };
    const setSort = (nextSort: typeof sort) => {
        navigate({ search: { filter, sort: nextSort } });
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
                            size="sm"
                            className="shrink-0"
                        >
                            {APPS_COPY.submitCtaButton}
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
                            size="sm"
                            className="shrink-0"
                        >
                            {APPS_COPY.pollenCtaButton}
                        </ExternalLinkButton>
                    </Surface>
                </div>
            </section>

            <Surface
                id="apps-filters"
                variant="panel"
                className="flex flex-col gap-5"
            >
                <div className="flex flex-col gap-2">
                    <div className="font-body text-sm font-semibold text-theme-text-soft">
                        {APPS_COPY.categoryLabel}
                    </div>
                    <ButtonGroup aria-label={APPS_COPY.categoryLabel}>
                        {CATEGORY_FILTERS.map((item) => (
                            <TabButton
                                key={item.id}
                                active={filter === item.id}
                                onClick={() => setFilter(item.id)}
                                size="sm"
                            >
                                {item.label}
                            </TabButton>
                        ))}
                    </ButtonGroup>
                </div>

                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                    <div className="flex flex-col gap-2">
                        <div className="font-body text-sm font-semibold text-theme-text-soft">
                            {APPS_COPY.sortLabel}
                        </div>
                        <ButtonGroup aria-label={APPS_COPY.sortLabel}>
                            {BADGE_FILTERS.map((item) => (
                                <TabButton
                                    key={item.id}
                                    active={sort === item.id}
                                    onClick={() => setSort(item.id)}
                                    size="sm"
                                >
                                    {item.label}
                                </TabButton>
                            ))}
                        </ButtonGroup>
                    </div>

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
                    </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-theme-text-soft">
                    <span className="inline-flex items-center gap-1.5">
                        <Chip intent="warning" size="sm">
                            {APPS_COPY.pollenBadge}
                        </Chip>
                        <span>{APPS_COPY.pollenLegendDesc}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Chip intent="success" size="sm">
                            {APPS_COPY.buzzBadge}
                        </Chip>
                        <span>{APPS_COPY.buzzLegendDesc}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Chip intent="alpha" size="sm">
                            {APPS_COPY.newBadge}
                        </Chip>
                        <span>{APPS_COPY.newLegendDesc}</span>
                    </span>
                </div>
            </Surface>

            {error ? (
                <Surface variant="panel" className="text-theme-text-base">
                    {error}
                </Surface>
            ) : (
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {selectedApps.map((app, index) => (
                        <AppCard
                            key={`${app.name}-${app.githubId || index}`}
                            app={app}
                        />
                    ))}
                </section>
            )}

            {!error && selectedApps.length === 0 && (
                <Surface
                    variant="panel"
                    className="text-center text-theme-text-base"
                >
                    {APPS_COPY.noAppsMessage}
                </Surface>
            )}
        </div>
    );
}
