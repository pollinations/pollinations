import type { FC } from "react";
import { getModelPrices } from "./data.ts";
import { ModelTable } from "./ModelTable.tsx";
import { Button } from "../button.tsx";
import { useModelStats } from "./useModelStats.ts";

export const Pricing: FC = () => {
    const allModels = getModelPrices();
    const { stats: modelStats } = useModelStats();

    const imageModels = allModels.filter((m) => m.type === "image");
    const videoModels = allModels.filter((m) => m.type === "video");
    const textModels = allModels.filter((m) => m.type === "text");

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h2 className="font-bold flex-1">Pricing</h2>
                <Button
                    as="a"
                    href="https://github.com/pollinations/pollinations/issues/5321"
                    target="_blank"
                    rel="noopener noreferrer"
                    color="amber"
                    weight="light"
                >
                    🤖 Vote on next models
                </Button>
            </div>
            <div className="bg-amber-50/30 rounded-2xl p-8 border border-amber-300 space-y-8 overflow-hidden">
                <div className="overflow-x-auto md:overflow-x-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] space-y-8">
                    <ModelTable
                        models={imageModels}
                        type="image"
                        modelStats={modelStats}
                    />
                    <ModelTable
                        models={videoModels}
                        type="video"
                        modelStats={modelStats}
                    />
                    <ModelTable
                        models={textModels}
                        type="text"
                        modelStats={modelStats}
                    />
                </div>

                <div className="pt-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div className="bg-white/50 rounded-lg p-3 border border-amber-200">
                            <div className="font-medium text-gray-900 mb-2">
                                Model Capabilities
                            </div>
                            <div className="space-y-1 text-gray-600">
                                <div>👁️ vision</div>
                                <div>👂 audio input</div>
                                <div>🧠 reasoning</div>
                                <div>🔍 search</div>
                            </div>
                        </div>
                        <div className="bg-white/50 rounded-lg p-3 border border-amber-200">
                            <div className="font-medium text-gray-900 mb-2">
                                Pricing Metrics
                            </div>
                            <div className="space-y-1 text-gray-600">
                                <div>
                                    <strong>/image</strong> = flat rate per
                                    image
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
                        </div>
                        <div className="bg-white/50 rounded-lg p-3 border border-amber-200">
                            <div className="font-medium text-gray-900 mb-2">
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
                    <p className="text-xs text-gray-600">
                        <span className="font-semibold">* 1 pollen ≈</span>{" "}
                        estimates for typical usage, actual costs vary with
                        prompt length and output
                    </p>
                </div>

                <div className="bg-gradient-to-r from-amber-100 to-orange-100 rounded-xl p-4 border border-amber-300 text-center">
                    <p className="text-sm font-medium text-amber-900">
                        🎁 <span className="font-bold">Beta bonus:</span> 2x
                        pollen on every purchase!
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                        Prices may adjust as we fine-tune during beta.
                    </p>
                </div>
            </div>
        </div>
    );
};
