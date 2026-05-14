import { type FC, useState } from "react";
import { DashboardSection } from "../layout/dashboard-section.tsx";
import { LinkButton } from "../ui/link-button.tsx";
import { TabButton } from "../ui/tab-button.tsx";
import { getModelPrices } from "./data.ts";
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
    const { stats } = useModelStats();
    const allModels = getModelPrices(stats);

    const imageModels = allModels.filter((m) => m.type === "image");
    const videoModels = allModels.filter((m) => m.type === "video");
    const audioModels = allModels.filter((m) => m.type === "audio");
    const textModels = allModels.filter((m) => m.type === "text");
    const embeddingModels = allModels.filter((m) => m.type === "embedding");
    const availableSections: SectionType[] = [
        "image",
        "video",
        ...(audioModels.length > 0 ? (["audio"] as SectionType[]) : []),
        "text",
        ...(embeddingModels.length > 0 ? (["embedding"] as SectionType[]) : []),
    ];

    return (
        <div className="flex flex-col gap-6">
            <DashboardSection
                title="Models"
                theme="teal"
                framed
                actionClassName="w-full sm:ml-auto sm:w-auto"
                action={
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <LinkButton
                            theme="teal"
                            href="https://model-monitor.pollinations.ai"
                            className="self-start sm:self-center"
                        >
                            📊 Model Health
                        </LinkButton>
                        <LinkButton
                            theme="teal"
                            href="https://github.com/pollinations/pollinations/issues/5321"
                            className="self-start sm:self-center"
                        >
                            🗳️ Vote for next model
                        </LinkButton>
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
                        textModels={textModels}
                        embeddingModels={embeddingModels}
                        activeTab={activeTab}
                        tierBalance={tierBalance}
                        packBalance={packBalance}
                    />
                </div>
                <div className="mt-5 space-y-2 border-t border-theme-border pt-5 text-[13px] leading-snug text-theme-text-soft">
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
            </DashboardSection>
        </div>
    );
};

const ImageIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-5-5L5 21" />
    </svg>
);

const TokensIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </svg>
);

const ClockIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
    </svg>
);
