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
                    color="amber"
                    weight="light"
                    size="small"
                >
                    🤖 Vote on next models
                </Button>
            </div>
            <div className="bg-amber-50/30 rounded-2xl p-8 border border-amber-300 space-y-8 overflow-x-auto md:overflow-x-visible">
                <ModelTable models={imageModels} type="image" />
                <ModelTable models={videoModels} type="video" />
                <ModelTable models={textModels} type="text" />

                <div className="text-xs text-gray-500 pt-4 border-t border-gray-300 space-y-2">
                    <div className="flex flex-wrap gap-x-4 items-center">
                        <span className="font-medium text-gray-900">
                            Model capabilities:
                        </span>
                        <span className="text-gray-600">👁️ vision</span>
                        <span className="text-gray-600">👂 audio input</span>
                        <span className="text-gray-600">🧠 reasoning</span>
                        <span className="text-gray-600">🔍 search</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4">
                        <span className="flex items-center gap-1 font-medium text-gray-600">
                            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-100 border border-pink-300 text-pink-500 text-[10px] font-bold">
                                i
                            </span>
                            1 pollen ≈
                        </span>
                        <span>
                            estimates for typical usage, actual costs vary with
                            prompt length and output
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 text-gray-500">
                        <span>
                            <strong>/image</strong> = flat rate per image (any
                            resolution)
                        </span>
                        <span>
                            <strong>/M</strong> = cost per million tokens
                        </span>
                        <span>
                            <strong>/sec</strong> = cost per second of video
                        </span>
                    </div>
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
