import {
    ClockIcon,
    ExternalLinkButton,
    GitHubIcon,
    ImageIcon,
    Section,
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
import {
    type SectionType,
    sectionLabels,
    UnifiedModelTable,
} from "./model-table.tsx";
import { useModelStats } from "./use-model-stats.ts";

type ModelsProps = {
    showCommunityEndpoints?: boolean;
};

export const Models: FC<ModelsProps> = ({ showCommunityEndpoints = false }) => {
    const [activeTab, setActiveTab] = useState<SectionType>("image");
    const [catalogModels, setCatalogModels] = useState<ApiModelInfo[]>([]);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const { stats } = useModelStats();
    const allModels = useMemo(
        () => getModelPricesFromCatalog(catalogModels, stats),
        [catalogModels, stats],
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

    const imageModels = allModels.filter((m) => m.type === "image");
    const videoModels = allModels.filter((m) => m.type === "video");
    const audioModels = allModels.filter((m) => m.type === "audio");
    const realtimeModels = allModels.filter((m) => m.type === "realtime");
    const textModels = allModels.filter((m) => m.type === "text");
    const communityModels = allModels.filter((m) => m.type === "community");
    const embeddingModels = allModels.filter((m) => m.type === "embedding");
    const availableSections: SectionType[] = [
        "image",
        "video",
        ...(audioModels.length > 0 ? (["audio"] as SectionType[]) : []),
        ...(realtimeModels.length > 0 ? (["realtime"] as SectionType[]) : []),
        "text",
        ...(communityModels.length > 0 ? (["community"] as SectionType[]) : []),
        ...(embeddingModels.length > 0 ? (["embedding"] as SectionType[]) : []),
    ];

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
                <div className="mb-4 flex flex-wrap gap-1.5">
                    {availableSections.map((section) => (
                        <TabButton
                            key={section}
                            active={activeTab === section}
                            onClick={() => setActiveTab(section)}
                        >
                            {sectionLabels[section]}
                        </TabButton>
                    ))}
                </div>
                {catalogError && (
                    <p className="mb-4 text-sm text-red-600">{catalogError}</p>
                )}
                <div className="overflow-x-auto md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <UnifiedModelTable
                        imageModels={imageModels}
                        videoModels={videoModels}
                        audioModels={audioModels}
                        realtimeModels={realtimeModels}
                        textModels={textModels}
                        communityModels={communityModels}
                        embeddingModels={embeddingModels}
                        activeTab={activeTab}
                    />
                </div>
                <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                    <p className="flex items-start gap-1.5">
                        <ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            <strong>/img</strong> — flat rate per image.
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
