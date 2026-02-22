/**
 * Dynamic Pollen Examples component for FAQ
 * Shows 2 examples each from video, image, and text models
 */

import type { FC } from "react";
import { calculatePerPollen } from "./calculations.ts";
import { getModelPrices } from "./data.ts";
import type { ModelPrice } from "./types.ts";
import { type ModelStats, useModelStats } from "./use-model-stats.ts";

type ExampleModel = {
    name: string;
    perPollen: string;
    unit: string;
};

const getUnit = (model: ModelPrice): string => {
    if (model.type === "video") return "clips";
    if (model.type === "image") return "images";
    return "chats";
};

const getExamples = (
    stats: ModelStats,
): {
    video: ExampleModel[];
    image: ExampleModel[];
    text: ExampleModel[];
} => {
    const allModels = getModelPrices(stats);

    const pickTwo = (
        models: ModelPrice[],
        type: "video" | "image" | "text",
    ): ExampleModel[] => {
        const filtered = models
            .filter((m) => m.type === type)
            .map((m) => ({
                name: m.name,
                perPollen: calculatePerPollen(m),
                unit: getUnit(m),
            }))
            .filter((m) => m.perPollen !== "—")
            .sort((a, b) => {
                const aNum = parseFloat(a.perPollen.replace(/[KM]/g, "")) || 0;
                const bNum = parseFloat(b.perPollen.replace(/[KM]/g, "")) || 0;
                const aMult = a.perPollen.includes("M")
                    ? 1000000
                    : a.perPollen.includes("K")
                      ? 1000
                      : 1;
                const bMult = b.perPollen.includes("M")
                    ? 1000000
                    : b.perPollen.includes("K")
                      ? 1000
                      : 1;
                return bNum * bMult - aNum * aMult;
            });

        if (filtered.length <= 2) return filtered;
        return [filtered[0], filtered[filtered.length - 1]];
    };

    return {
        video: pickTwo(allModels, "video"),
        image: pickTwo(allModels, "image"),
        text: pickTwo(allModels, "text"),
    };
};

const CategorySection: FC<{
    emoji: string;
    title: string;
    models: ExampleModel[];
}> = ({ emoji, title, models }) => {
    if (models.length === 0) return null;

    return (
        <div className="space-y-2">
            <div className="font-semibold text-gray-700">
                {emoji} {title}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {models.map((model) => (
                    <div
                        key={model.name}
                        className="bg-violet-100/80 rounded-lg px-3 py-2"
                    >
                        <span className="font-medium text-violet-800 capitalize">
                            {model.name}
                        </span>
                        <span className="text-gray-600">
                            {" "}
                            — {model.perPollen} {model.unit}/pollen
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const PollenExamples: FC = () => {
    const { stats } = useModelStats();
    const examples = getExamples(stats);

    return (
        <div className="mt-4 bg-violet-50/50 rounded-xl p-4 space-y-4">
            <div className="text-sm text-gray-600 mb-3">
                <strong>$1 ≈ 1 Pollen</strong> — here's what you can create:
            </div>

            <CategorySection emoji="🎬" title="Video" models={examples.video} />
            <CategorySection emoji="🎨" title="Image" models={examples.image} />
            <CategorySection emoji="💬" title="Text" models={examples.text} />

            <div className="text-xs text-gray-500 pt-2">
                Values are estimates based on typical usage. See{" "}
                <strong>Pricing</strong> below for exact rates.
            </div>
        </div>
    );
};
