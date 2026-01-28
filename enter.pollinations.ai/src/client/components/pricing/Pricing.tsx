import type { FC } from "react";
import { Button } from "../button.tsx";
import { getModelPrices } from "./data.ts";
import { UnifiedModelTable } from "./ModelTable.tsx";
import { useModelStats } from "./useModelStats.ts";

export const Pricing: FC = () => {
    const { stats } = useModelStats();
    const allModels = getModelPrices(stats);

    const imageModels = allModels.filter((m) => m.type === "image");
    const videoModels = allModels.filter((m) => m.type === "video");
    const textModels = allModels.filter((m) => m.type === "text");

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="font-bold flex-1">Pricing</h2>
                <Button
                    as="a"
                    href="https://github.com/pollinations/pollinations/issues/5321"
                    target="_blank"
                    rel="noopener noreferrer"
                    color="amber"
                    weight="light"
                    className="self-start"
                >
                    Vote on next models
                </Button>
            </div>
            <div className="bg-amber-50/30 rounded-2xl p-6 border border-amber-300 space-y-6">
                <div className="overflow-x-auto md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <UnifiedModelTable
                        imageModels={imageModels}
                        videoModels={videoModels}
                        textModels={textModels}
                    />
                </div>

                <div className="pt-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div className="bg-white/50 rounded-lg p-4 border border-amber-200">
                            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
                                Model Capabilities
                            </div>
                            <div className="space-y-1 text-gray-600">
                                <div>👁️ vision</div>
                                <div>🎙️ audio input</div>
                                <div>🔊 audio output</div>
                                <div>🧠 reasoning</div>
                                <div>🔍 search</div>
                                <div>💻 code execution</div>
                            </div>
                        </div>
                        <div className="bg-white/50 rounded-lg p-4 border border-amber-200">
                            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
                                Pricing Metrics
                            </div>
                            <div className="space-y-1 text-gray-600">
                                <div>
                                    <strong>/img</strong> = flat rate per image
                                </div>
                                <div>
                                    <strong>/M</strong> = cost per million
                                    tokens
                                </div>
                                <div>
                                    <strong>/sec</strong> = cost per second of
                                    video
                                </div>
                            </div>
                            <div className="text-xs text-amber-700 mt-3 pt-3 border-t border-amber-200">
                                <div>
                                    <span className="font-semibold">*</span> 1
                                    pollen ≈ based on average community usage.
                                </div>
                                <div>
                                    Actual costs vary with modality and output.
                                </div>
                            </div>
                        </div>
                        <div className="bg-white/50 rounded-lg p-4 border border-amber-200">
                            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
                                Token Types
                            </div>
                            <div className="space-y-1 text-gray-600">
                                <div>💬 text input/output</div>
                                <div>💾 cached input</div>
                                <div>🔊 audio input/output</div>
                                <div>🖼️ image</div>
                                <div>🎬 video</div>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-white/50 rounded-lg px-4 py-3 border border-amber-200">
                            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
                                💡 How Pollen is Spent
                            </div>
                            <div className="space-y-1 text-xs text-gray-600">
                                <div>1. Daily tier grants are used first</div>
                                <div>
                                    2. Purchased pollen is used after daily is
                                    depleted
                                </div>
                                <div className="text-amber-700 mt-2">
                                    ⚠️ <strong>Exception:</strong> 💎 Paid Only
                                    models require purchased pollen only
                                </div>
                            </div>
                        </div>
                        <div className="bg-white/50 rounded-lg px-4 py-3 border border-amber-200">
                            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
                                🎁 Beta Bonus
                            </div>
                            <div className="space-y-2 text-xs text-gray-600">
                                <div className="flex items-center gap-1">
                                    <span>💎</span>
                                    <span className="font-medium">
                                        2x pollen on every purchase!
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <a
                                        href="#buy-pollen"
                                        className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800 font-medium underline"
                                    >
                                        Buy Pollen ↑
                                    </a>
                                    <span className="text-gray-400">
                                        powered by
                                    </span>
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
                                </div>
                                <div className="text-amber-700 text-xs mt-1">
                                    Prices may adjust during beta.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
