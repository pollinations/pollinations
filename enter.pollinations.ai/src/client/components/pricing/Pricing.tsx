import { type FC, useState } from "react";
import { DashboardSection } from "../layout/dashboard-section.tsx";
import { Card } from "../ui/card.tsx";
import { LinkButton } from "../ui/link-button.tsx";
import { Panel } from "../ui/panel.tsx";
import { TabButton } from "../ui/tab-button.tsx";
import { getModelPrices } from "./data.ts";
import {
    type SectionType,
    sectionLabels,
    UnifiedModelTable,
} from "./model-table.tsx";
import { useModelStats } from "./use-model-stats.ts";

type PricingProps = {
    tierBalance?: number;
    packBalance?: number;
};

export const Pricing: FC<PricingProps> = ({ tierBalance, packBalance }) => {
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
                            className="px-4 pt-1.5 pb-2 text-base"
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
            </DashboardSection>

            <Panel>
                <div className="grid gap-3 lg:grid-cols-3">
                    <Card className="text-xs !border-transparent">
                        <div className="font-bold text-gray-900 uppercase tracking-wide mb-2">
                            💡 How Pollen is Spent
                        </div>
                        <div className="space-y-1 text-xs text-gray-500">
                            <div>
                                1. Regular models use tier balance when it
                                covers the full request, otherwise paid balance
                            </div>
                            <div className="text-purple-700">
                                2. 🪷 Paid-only models use paid balance only
                            </div>
                        </div>
                    </Card>
                    <Card className="text-xs !border-transparent">
                        <div className="font-bold text-gray-900 uppercase tracking-wide mb-2">
                            🎁 Beta Bonus
                        </div>
                        <div className="space-y-2 text-xs text-gray-500">
                            <div>
                                Beta ladder is live on pollen purchases 🪷. See
                                the balance panel above for the full bonus
                                details.
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <a
                                    href="#buy-pollen"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-teal-500 text-white font-semibold text-xs shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200"
                                >
                                    <span>🌸</span>
                                    <span>Top-up</span>
                                    <span className="text-white/80">↑</span>
                                </a>
                                <span className="inline-flex items-center gap-2 whitespace-nowrap text-gray-400 text-[10px]">
                                    <span>powered by</span>
                                    <svg
                                        className="h-4"
                                        viewBox="0 0 60 25"
                                        fill="#635BFF"
                                        xmlns="http://www.w3.org/2000/svg"
                                        role="img"
                                        aria-labelledby="stripe-title"
                                    >
                                        <title id="stripe-title">Stripe</title>
                                        <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a10.3 10.3 0 0 1-4.56.95c-4.01 0-6.83-2.5-6.83-7.28 0-4.19 2.39-7.34 6.42-7.34 3.23 0 5.78 2.38 5.78 6.84v1.91zm-8.09-2.62h4.24c0-1.41-.56-2.84-2.09-2.84-1.43 0-2.15 1.36-2.15 2.84zM40.95 5.57c-1.33 0-2.31.58-2.87 1.34l-.12-.99h-3.56v18.56l4.02-.86.01-4.51c.55.42 1.36 1.01 2.69 1.01 2.72 0 5.2-2.2 5.2-7.13 0-4.49-2.53-7.42-5.37-7.42zm-.95 10.35c-.9 0-1.42-.32-1.78-.72l-.02-5.69c.39-.45.93-.78 1.8-.78 1.38 0 2.33 1.55 2.33 3.59 0 2.06-.94 3.6-2.33 3.6zM28.24 4.66l4.05-.86V.51l-4.05.85v3.3zM32.29 5.91H28.24v14h4.05v-14zM24.36 7.24l-.26-1.33h-3.49v14h4.04V10.3c.96-1.25 2.58-1.02 3.08-.84V5.91c-.52-.19-2.42-.56-3.37 1.33zM16.05 2.72l-3.95.84-.02 12.82c0 2.37 1.78 4.11 4.15 4.11 1.31 0 2.27-.24 2.8-.53v-3.28c-.51.21-3.02.94-3.02-1.42V9.26h3.02V5.91h-3.02l.04-3.19zM5.36 10.03c0-.6.5-.83 1.31-.83 1.17 0 2.66.36 3.83.99V6.54c-1.28-.51-2.55-.71-3.83-.71C3.38 5.83.96 7.75.96 10.42c0 4.15 5.71 3.49 5.71 5.28 0 .7-.61.93-1.46.93-1.27 0-2.89-.52-4.18-1.23v3.7c1.42.61 2.86.87 4.18.87 3.35 0 5.65-1.66 5.65-4.38 0-4.48-5.5-3.68-5.5-5.56z" />
                                    </svg>
                                </span>
                            </div>
                        </div>
                    </Card>
                    <Card className="text-xs !border-transparent">
                        <div className="font-bold text-gray-900 uppercase tracking-wide mb-2">
                            🧮 Pricing Metrics
                        </div>
                        <div className="grid gap-x-6 gap-y-1.5 text-gray-500 text-left lg:grid-cols-1">
                            <div>
                                <strong>/img</strong> = flat rate per image
                            </div>
                            <div>
                                <strong>/M</strong> = per million tokens
                            </div>
                            <div>
                                <strong>/sec</strong> = per second of
                                video/audio; TTS is estimated from text length
                            </div>
                        </div>
                    </Card>
                </div>
            </Panel>
        </div>
    );
};
