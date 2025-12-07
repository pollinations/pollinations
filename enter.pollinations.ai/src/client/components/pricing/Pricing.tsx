import type { FC } from "react";
import { getModelPrices } from "./data.ts";
import { ModelTable } from "./ModelTable.tsx";
import { Button } from "../button.tsx";

export const Pricing: FC = () => {
    const allModels = getModelPrices();

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
                    className="!bg-amber-200 !text-amber-900 !border-amber-300"
                    weight="light"
                    size="small"
                >
                    🤖 Vote on next models
                </Button>
            </div>
            <div className="bg-amber-50/30 rounded-2xl p-8 border border-amber-300 space-y-8 overflow-x-auto md:overflow-x-visible">
                <div className="flex flex-col sm:flex-row gap-2 text-xs">
                    <div className="flex-1 flex flex-wrap gap-x-4 items-center px-3 py-2 rounded-lg bg-gray-500/5 border border-gray-200/50">
                        <span className="font-medium text-gray-900">
                            Capabilities:
                        </span>
                        <span className="text-gray-600">👁️ vision</span>
                        <span className="text-gray-600">👂 audio input</span>
                        <span className="text-gray-600">🧠 reasoning</span>
                        <span className="text-gray-600">🔍 search</span>
                    </div>
                    <div className="flex-1 flex flex-wrap gap-x-4 items-center px-3 py-2 rounded-lg bg-gray-500/5 border border-gray-200/50">
                        <span className="font-medium text-gray-900">
                            Modalities:
                        </span>
                        <span className="text-gray-600">💬 text</span>
                        <span className="text-gray-600">🔊 audio</span>
                        <span className="text-gray-600">🖼️ image</span>
                        <span className="text-gray-600">🎬 video</span>
                    </div>
                </div>

                <ModelTable models={imageModels} type="image" />
                <ModelTable models={videoModels} type="video" />
                <ModelTable models={textModels} type="text" />

                <div className="text-xs text-gray-500 pt-4 border-t border-gray-300">
                    <div className="flex flex-wrap gap-x-4">
                        <span className="flex items-center gap-1 font-medium text-gray-600">
                            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-100 border border-pink-300 text-pink-500 text-[10px] font-bold">
                                i
                            </span>
                            1 pollen ≈
                        </span>
                        <span>
                            estimates for typical usage, actual costs vary with
                            prompt length and output size
                        </span>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl p-4 border-2 border-purple-300 text-center">
                    <p className="text-sm font-medium text-purple-900">
                        🎁 <span className="font-bold">Beta bonus:</span> 2x
                        pollen on every purchase!
                    </p>
                    <p className="text-xs text-purple-700 mt-1">
                        Prices may adjust as we fine-tune during beta.
                    </p>
                </div>
            </div>
        </div>
    );
};
