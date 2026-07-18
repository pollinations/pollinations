import {
    Alert,
    Chip,
    ClockIcon,
    ExternalLinkButton,
    GitHubIcon,
    Input,
    SearchIcon,
    Section,
    SparklesIcon,
    TabButton,
    TokensIcon,
    TrendUpIcon,
} from "@pollinations/ui";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { CommunityEndpoints } from "../community-endpoints";
import {
    type ApiModelInfo,
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "./model-catalog.ts";
import { getModelDisplayCategory } from "./model-categories.ts";
import { getModelDisplayName } from "./model-info.ts";
import type { ModelSortDirection, ModelSortKey } from "./model-search.ts";
import {
    type SectionType,
    sectionLabels,
    UnifiedModelTable,
} from "./model-table.tsx";
import type { ModelPrice } from "./types.ts";
import { useModelStats } from "./use-model-stats.ts";

type ModelsProps = {
    // Render the owner-scoped "My Models" section (logged-in dashboard only).
    showCommunityEndpoints?: boolean;
    // Allowlisted owners can make their models public; everyone else is limited
    // to private, owner-only models.
    canPublish?: boolean;
};

const SECTION_ORDER: SectionType[] = [
    "all",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "text",
    "community-text",
    "community-image",
    "embedding",
];

const SEARCH_LABELS: Record<SectionType, string> = {
    all: "all",
    image: "image",
    video: "video",
    "3d": "3D",
    audio: "audio",
    realtime: "realtime",
    text: "text",
    "community-text": "community text",
    "community-image": "community image",
    embedding: "embedding",
};

const DEFAULT_SORT_DIRECTIONS: Record<ModelSortKey, ModelSortDirection> = {
    name: "asc",
    perPollen: "desc",
    input: "asc",
    output: "asc",
};

function matchesQuery(model: ModelPrice, query: string): boolean {
    if (!query) return true;
    const displayName = getModelDisplayName(model) ?? "";
    const haystack =
        `${model.name} ${displayName} ${model.description ?? ""} ${model.brand ?? ""}`.toLowerCase();
    return haystack.includes(query);
}

function categorizeModels(
    models: ModelPrice[],
): Record<SectionType, ModelPrice[]> {
    const categorized: Record<SectionType, ModelPrice[]> = {
        all: models,
        image: [],
        video: [],
        "3d": [],
        audio: [],
        realtime: [],
        text: [],
        "community-text": [],
        "community-image": [],
        embedding: [],
    };

    for (const model of models) {
        categorized[getModelDisplayCategory(model.type, model.community)].push(
            model,
        );
    }
    return categorized;
}

export const Models: FC<ModelsProps> = ({
    showCommunityEndpoints = false,
    canPublish = false,
}) => {
    const navigate = useNavigate({ from: "/models" });
    const modelSearch = useSearch({ from: "/_dashboard/models" });
    const activeTab = modelSearch.category ?? "all";
    const search = modelSearch.q ?? "";
    const sortKey = modelSearch.sort ?? "perPollen";
    const sortDir = modelSearch.dir ?? DEFAULT_SORT_DIRECTIONS[sortKey];
    const [catalogModels, setCatalogModels] = useState<ApiModelInfo[]>([]);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const { stats } = useModelStats();
    const allModels = useMemo(
        () => getModelPricesFromCatalog(catalogModels, stats),
        [catalogModels, stats],
    );
    const query = search.trim().toLowerCase();
    const filteredModels = useMemo(
        () =>
            query ? allModels.filter((m) => matchesQuery(m, query)) : allModels,
        [allModels, query],
    );

    const loadModelCatalog = useCallback(
        (options: { refresh?: boolean } = {}) =>
            fetchModelCatalog(options)
                .then((models) => {
                    setCatalogModels(models);
                    setCatalogError(null);
                })
                .catch(() => {
                    setCatalogModels([]);
                    setCatalogError("Could not load models.");
                }),
        [],
    );

    useEffect(() => {
        void loadModelCatalog();
    }, [loadModelCatalog]);

    const sectionModels = useMemo(
        () => categorizeModels(filteredModels),
        [filteredModels],
    );
    const searchLabel = SEARCH_LABELS[activeTab];

    const setActiveTab = (category: SectionType) => {
        void navigate({
            search: (previous) => ({
                ...previous,
                category: category === "all" ? undefined : category,
            }),
        });
    };

    const setSearch = (q: string) => {
        void navigate({
            search: (previous) => ({
                ...previous,
                q: q || undefined,
            }),
            replace: true,
        });
    };

    const onSort = (key: ModelSortKey) => {
        const nextDirection =
            key === sortKey
                ? sortDir === "asc"
                    ? "desc"
                    : "asc"
                : DEFAULT_SORT_DIRECTIONS[key];

        void navigate({
            search: (previous) => ({
                ...previous,
                sort: key === "perPollen" ? undefined : key,
                dir:
                    nextDirection === DEFAULT_SORT_DIRECTIONS[key]
                        ? undefined
                        : nextDirection,
            }),
        });
    };

    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Models"
                framed
                actionClassName="w-full sm:ml-auto sm:w-auto"
                action={
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <ExternalLinkButton
                            href="https://model-monitor.pollinations.ai"
                            className="self-start sm:self-center"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <TrendUpIcon className="h-4 w-4" />
                                Model Health
                            </span>
                        </ExternalLinkButton>
                        <ExternalLinkButton
                            href="https://github.com/pollinations/pollinations/issues/5321"
                            className="self-start sm:self-center"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <GitHubIcon className="h-4 w-4" />
                                Vote for next model
                            </span>
                        </ExternalLinkButton>
                    </div>
                }
            >
                <div className="mb-4 flex flex-col items-start gap-3">
                    <div className="flex flex-wrap gap-1.5">
                        {SECTION_ORDER.map((section) => (
                            <TabButton
                                key={section}
                                active={activeTab === section}
                                onClick={() => setActiveTab(section)}
                                ariaLabel={
                                    section === "community-text" ||
                                    section === "community-image"
                                        ? `${sectionLabels[section]} alpha models`
                                        : undefined
                                }
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    {sectionLabels[section]}
                                    {(section === "community-text" ||
                                        section === "community-image") && (
                                        <Chip intent="alpha" size="sm">
                                            Alpha
                                        </Chip>
                                    )}
                                </span>
                            </TabButton>
                        ))}
                    </div>
                    <div className="relative w-full sm:w-72">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-text-muted" />
                        <Input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={`Search ${searchLabel} models…`}
                            aria-label={`Search ${searchLabel} models`}
                            className="w-full pl-9"
                        />
                    </div>
                </div>
                {catalogError && (
                    <Alert intent="danger" className="mb-4">
                        {catalogError}
                    </Alert>
                )}
                {query && sectionModels[activeTab].length === 0 ? (
                    <p className="py-8 text-center text-sm text-theme-text-muted">
                        No {sectionLabels[activeTab].toLowerCase()} models match
                        “{search.trim()}”.
                    </p>
                ) : (
                    <div className="overflow-x-auto md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        <UnifiedModelTable
                            allModels={sectionModels.all}
                            imageModels={sectionModels.image}
                            videoModels={sectionModels.video}
                            model3dModels={sectionModels["3d"]}
                            audioModels={sectionModels.audio}
                            realtimeModels={sectionModels.realtime}
                            textModels={sectionModels.text}
                            communityTextModels={
                                sectionModels["community-text"]
                            }
                            communityImageModels={
                                sectionModels["community-image"]
                            }
                            embeddingModels={sectionModels.embedding}
                            activeTab={activeTab}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={onSort}
                        />
                    </div>
                )}
                <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                    <p className="flex items-start gap-1.5">
                        <SparklesIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            <strong>/gen</strong> — flat rate per image or audio
                            generation.
                        </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                        <TokensIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            <strong>/M</strong> — per million tokens.
                        </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                        <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            <strong>/sec</strong> — per second of video/audio;
                            TTS is estimated from text length.
                        </span>
                    </p>
                </div>
            </Section>
            {showCommunityEndpoints && (
                <CommunityEndpoints
                    canPublish={canPublish}
                    onChange={() => {
                        void loadModelCatalog({ refresh: true });
                    }}
                />
            )}
        </div>
    );
};
