import {
    ClockIcon,
    ExternalLinkButton,
    ImageIcon,
    Section,
    TabButton,
    TokensIcon,
} from "@pollinations/ui";
import { type FC, useEffect, useMemo, useState } from "react";
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
    tierBalance?: number;
    packBalance?: number;
};

export const Models: FC<ModelsProps> = ({ tierBalance, packBalance }) => {
    const [activeTab, setActiveTab] = useState<SectionType>("image");
    const [catalogModels, setCatalogModels] = useState<ApiModelInfo[]>([]);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const { stats } = useModelStats();
    const allModels = useMemo(
        () => getModelPricesFromCatalog(catalogModels, stats),
        [catalogModels, stats],
    );

    useEffect(() => {
        let cancelled = false;

        fetchModelCatalog()
            .then((models) => {
                if (!cancelled) {
                    setCatalogModels(models);
                    setCatalogError(null);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setCatalogModels([]);
                    setCatalogError("Could not load models.");
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const imageModels = allModels.filter((m) => m.type === "image");
    const videoModels = allModels.filter((m) => m.type === "video");
    const audioModels = allModels.filter((m) => m.type === "audio");
    const realtimeModels = allModels.filter((m) => m.type === "realtime");
    const textModels = allModels.filter((m) => m.type === "text");
    const embeddingModels = allModels.filter((m) => m.type === "embedding");
    const availableSections: SectionType[] = [
        "image",
        "video",
        ...(audioModels.length > 0 ? (["audio"] as SectionType[]) : []),
        ...(realtimeModels.length > 0 ? (["realtime"] as SectionType[]) : []),
        "text",
        ...(embeddingModels.length > 0 ? (["embedding"] as SectionType[]) : []),
    ];

    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Models"
                theme="teal"
                framed
                actionClassName="w-full sm:ml-auto sm:w-auto"
                action={
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <ExternalLinkButton
                            theme="teal"
                            href="https://model-monitor.pollinations.ai"
                            className="self-start sm:self-center"
                        >
                            📊 Model Health
                        </ExternalLinkButton>
                        <ExternalLinkButton
                            theme="teal"
                            href="https://github.com/pollinations/pollinations/issues/5321"
                            className="self-start sm:self-center"
                        >
                            🗳️ Vote for next model
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
                            <span className="font-bold">
                                {sectionLabels[section]}
                            </span>
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
                        embeddingModels={embeddingModels}
                        activeTab={activeTab}
                        tierBalance={tierBalance}
                        packBalance={packBalance}
                    />
                </div>
                <div className="mt-5 space-y-2 border-t border-ink-200 pt-5 text-[13px] leading-snug text-ink-500">
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
        </div>
    );
};
