/**
 * Dynamic Pollen Examples component for FAQ
 * Shows 2 examples each from video, image, and text models
 */

import { ChatIcon, ImageIcon, VideoIcon } from "@pollinations/ui";
import { type FC, type ReactNode, useEffect, useMemo, useState } from "react";
import { calculatePerPollen } from "./calculations.ts";
import {
    type ApiModelInfo,
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "./model-catalog.ts";
import type { ModelPrice } from "./types.ts";
import { useModelStats } from "./use-model-stats.ts";

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
    allModels: ModelPrice[],
): {
    video: ExampleModel[];
    image: ExampleModel[];
    text: ExampleModel[];
} => {
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
    icon: ReactNode;
    title: string;
    models: ExampleModel[];
}> = ({ icon, title, models }) => {
    if (models.length === 0) return null;

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-ink-700">
                {icon} {title}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {models.map((model) => (
                    <div
                        key={model.name}
                        className="bg-theme-bg-pale rounded-lg px-3 py-2"
                    >
                        <span className="font-medium text-theme-text-soft capitalize">
                            {model.name}
                        </span>
                        <span className="text-theme-text-muted">
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
    const [catalogModels, setCatalogModels] = useState<ApiModelInfo[]>([]);
    const { stats } = useModelStats();

    useEffect(() => {
        let cancelled = false;

        fetchModelCatalog()
            .then((models) => {
                if (!cancelled) setCatalogModels(models);
            })
            .catch(() => {
                if (!cancelled) setCatalogModels([]);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const examples = useMemo(() => {
        const allModels = getModelPricesFromCatalog(catalogModels, stats);
        return getExamples(allModels);
    }, [catalogModels, stats]);

    if (
        examples.video.length === 0 &&
        examples.image.length === 0 &&
        examples.text.length === 0
    ) {
        return null;
    }

    return (
        <div className="mt-4 bg-surface-opaque/80 rounded-xl p-4 space-y-4">
            <div className="text-sm text-theme-text-muted mb-3">
                <strong>$1 ≈ 1 Pollen</strong> — here's what you can create:
            </div>

            <CategorySection
                icon={<VideoIcon className="h-4 w-4" />}
                title="Video"
                models={examples.video}
            />
            <CategorySection
                icon={<ImageIcon className="h-4 w-4" />}
                title="Image"
                models={examples.image}
            />
            <CategorySection
                icon={<ChatIcon className="h-4 w-4" />}
                title="Text"
                models={examples.text}
            />

            <div className="text-xs text-theme-text-muted pt-2">
                Values are estimates based on typical usage. See{" "}
                <strong>Pricing</strong> below for exact rates.
            </div>
        </div>
    );
};
