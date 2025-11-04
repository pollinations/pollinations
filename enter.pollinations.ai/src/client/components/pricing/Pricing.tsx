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
            <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl p-4 border-2 border-purple-300 mb-2">
                <p className="text-sm font-medium text-purple-900">
                    ✨ <span className="font-bold">Beta vibes!</span> Our pricing is still cooking and might change as we make things even better for you 💜 
                    Feel free to explore and see what fits your creative flow~ 🌸
                </p>
            </div>
            <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300 space-y-8 overflow-x-auto md:overflow-x-visible">
                <ModelTable models={imageModels} type="image" />
                <ModelTable models={textModels} type="text" />
                <div className="text-xs text-gray-500 italic mt-4 pt-4 border-t border-gray-300">
                    * "Per pollen" estimates are based on typical usage patterns. Text calculations use workload profiles that automatically adjust for model capabilities (standard chat, reasoning, vision, audio). Image calculations use standard generation parameters. Actual costs may vary based on your specific prompts, output length, and features used.
                </div>
            </div>
        </div>
    );
};
