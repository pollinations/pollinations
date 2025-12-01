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
                    className="!bg-blue-200 !text-blue-900"
                    color="blue"
                    weight="light"
                    size="small"
                >
                    🤖 Vote on next models
                </Button>
            </div>
            <div className="bg-amber-50/30 rounded-2xl p-8 border border-amber-300 space-y-8 overflow-x-auto md:overflow-x-visible">
                <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl p-4 border-2 border-purple-300">
                    <p className="text-sm font-medium text-purple-900">
                        ✨ <span className="font-bold">Beta vibes!</span> Our
                        pricing is still cooking and might change as we make
                        things even better for you 💜 Feel free to explore and
                        see what fits your creative flow~ 🌸
                    </p>
                </div>

                <ModelTable models={imageModels} type="image" />
                <ModelTable models={videoModels} type="video" />
                <ModelTable models={textModels} type="text" />

                <div className="text-xs text-gray-500 italic pt-4 border-t border-gray-300">
                    * "Per pollen" estimates are based on typical usage
                    patterns. Text calculations use workload profiles that
                    automatically adjust for model capabilities (standard chat,
                    reasoning, vision, audio). Image calculations use standard
                    generation parameters. Actual costs may vary based on your
                    specific prompts, output length, and features used.
                </div>
            </div>
        </div>
    );
};
