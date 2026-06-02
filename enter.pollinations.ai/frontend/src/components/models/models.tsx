import {
    ClockIcon,
    ExternalLinkButton,
    ImageIcon,
    Section,
    TabButton,
    TokensIcon,
} from "@pollinations/ui";
import { type FC, useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import {
    type CommunityEndpoint,
    CommunityEndpoints,
} from "../community-endpoints";
import { getCommunityModelPrices, getModelPrices } from "./data.ts";
import {
    type SectionType,
    sectionLabels,
    UnifiedModelTable,
} from "./model-table.tsx";
import { useModelStats } from "./use-model-stats.ts";

type ModelsProps = {
    tierBalance?: number;
    packBalance?: number;
    showCommunityEndpoints?: boolean;
};

export const Models: FC<ModelsProps> = ({
    tierBalance,
    packBalance,
    showCommunityEndpoints = false,
}) => {
    const [activeTab, setActiveTab] = useState<SectionType>("image");
    const [communityEndpoints, setCommunityEndpoints] = useState<
        CommunityEndpoint[]
    >([]);
    const { stats } = useModelStats();
    const allModels = getModelPrices(stats);
    const communityModels = getCommunityModelPrices(communityEndpoints);

    const loadCommunityEndpoints = useCallback(async () => {
        if (!showCommunityEndpoints) {
            setCommunityEndpoints([]);
            return;
        }
        const response = await apiClient["community-endpoints"].$get();
        if (!response.ok) {
            setCommunityEndpoints([]);
            return;
        }
        const body = (await response.json()) as { data: CommunityEndpoint[] };
        setCommunityEndpoints(body.data);
    }, [showCommunityEndpoints]);

    useEffect(() => {
        void loadCommunityEndpoints();
    }, [loadCommunityEndpoints]);

    useEffect(() => {
        if (activeTab === "community" && communityModels.length === 0) {
            setActiveTab("text");
        }
    }, [activeTab, communityModels.length]);

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
        ...(communityModels.length > 0 ? (["community"] as SectionType[]) : []),
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
                <div className="overflow-x-auto md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <UnifiedModelTable
                        imageModels={imageModels}
                        videoModels={videoModels}
                        audioModels={audioModels}
                        realtimeModels={realtimeModels}
                        textModels={textModels}
                        embeddingModels={embeddingModels}
                        communityModels={communityModels}
                        activeTab={activeTab}
                        tierBalance={tierBalance}
                        packBalance={packBalance}
                    />
                </div>
                <div className="mt-5 space-y-2 border-t border-gray-200 pt-5 text-[13px] leading-snug text-gray-500">
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
                <CommunityEndpoints onChange={loadCommunityEndpoints} />
            )}
        </div>
    );
};
