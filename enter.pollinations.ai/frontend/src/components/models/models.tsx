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
import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { CommunityEndpoints } from "../community-endpoints";
import {
    type ApiModelInfo,
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "./model-catalog.ts";
import { getModelDisplayName } from "./model-info.ts";
import {
    type SectionType,
    sectionLabels,
    UnifiedModelTable,
} from "./model-table.tsx";
import type { ModelPrice } from "./types.ts";
import { useModelStats } from "./use-model-stats.ts";

type ModelsProps = {
    showCommunityEndpoints?: boolean;
};

const SECTION_ORDER: SectionType[] = [
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "text",
    "community",
    "embedding",
];

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
    return {
        image: models.filter((m) => m.type === "image"),
        video: models.filter((m) => m.type === "video"),
        "3d": models.filter((m) => m.type === "3d"),
        audio: models.filter((m) => m.type === "audio"),
        realtime: models.filter((m) => m.type === "realtime"),
        text: models.filter((m) => m.type === "text" && !m.community),
        community: models.filter((m) => m.community),
        embedding: models.filter((m) => m.type === "embedding"),
    };
}

export const Models: FC<ModelsProps> = ({ showCommunityEndpoints = false }) => {
    const [activeTab, setActiveTab] = useState<SectionType>("image");
    const [catalogModels, setCatalogModels] = useState<ApiModelInfo[]>([]);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
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

    // Tab visibility follows the full catalog so a search query never hides
    // or auto-switches away from a tab — only its contents are filtered.
    const sectionModelsAll = useMemo(
        () => categorizeModels(allModels),
        [allModels],
    );
    const sectionModels = useMemo(
        () => categorizeModels(filteredModels),
        [filteredModels],
    );
    const availableSections =
        allModels.length > 0
            ? SECTION_ORDER.filter(
                  (section) => sectionModelsAll[section].length,
              )
            : SECTION_ORDER;

    useEffect(() => {
        if (!availableSections.includes(activeTab)) {
            setActiveTab(availableSections[0] ?? "text");
        }
    }, [activeTab, availableSections]);

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
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-1.5">
                        {availableSections.map((section) => (
                            <TabButton
                                key={section}
                                active={activeTab === section}
                                onClick={() => setActiveTab(section)}
                                ariaLabel={
                                    section === "community"
                                        ? "Community alpha models"
                                        : undefined
                                }
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    {sectionLabels[section]}
                                    {section === "community" && (
                                        <Chip intent="alpha" size="sm">
                                            ALPHA
                                        </Chip>
                                    )}
                                </span>
                            </TabButton>
                        ))}
                    </div>
                    <div className="relative w-full sm:w-64">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-text-muted" />
                        <Input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search models…"
                            aria-label="Search models"
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
                            imageModels={sectionModels.image}
                            videoModels={sectionModels.video}
                            model3dModels={sectionModels["3d"]}
                            audioModels={sectionModels.audio}
                            realtimeModels={sectionModels.realtime}
                            textModels={sectionModels.text}
                            communityModels={sectionModels.community}
                            embeddingModels={sectionModels.embedding}
                            activeTab={activeTab}
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
                    onChange={() => {
                        void loadModelCatalog({ refresh: true });
                    }}
                />
            )}
        </div>
    );
};
