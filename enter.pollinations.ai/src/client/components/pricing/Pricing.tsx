import type { FC } from "react";
import { getModelPrices } from "./data.ts";
import { ModelTable } from "./ModelTable.tsx";

export const Pricing: FC = () => {
    const allModels = getModelPrices();
    
    const imageModels = allModels.filter(m => m.type === "image");
    const textModels = allModels.filter(m => m.type === "text");

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="font-bold flex-1">Pricing</h2>
            </div>
            <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300 space-y-8">
                <ModelTable models={imageModels} type="image" />
                <ModelTable models={textModels} type="text" />
                <div className="text-xs text-gray-500 italic mt-4 pt-4 border-t border-gray-300">
                    * "Per pollen" estimates are based on typical usage. For text models, we assume ~350 tokens per response (approximately one detailed paragraph). For images, we use standard generation parameters. Actual costs may vary based on your specific prompts, output length, and model capabilities.
                </div>
            </div>
        </div>
    );
};
