import { memo, useState } from "react";
import { PLAY_PAGE } from "../../../copy/content/play";
import type { Model } from "../../../hooks/useModelList";
import { usePageCopy } from "../../../hooks/usePageCopy";
import { Button } from "../ui/button";

type ModelCategory = "image" | "text" | "audio" | "video";

interface ModelSelectorProps {
    models: Model[];
    selectedModel: string;
    onSelectModel: (id: string) => void;
    showLegend?: boolean;
    allowedImageModelIds: Set<string>;
    allowedTextModelIds: Set<string>;
    allowedAudioModelIds: Set<string>;
}

const CATEGORY_GLOW: Record<ModelCategory, string> = {
    image: "var(--primary-strong)",
    text: "var(--secondary-strong)",
    audio: "var(--tertiary-strong)",
    video: "var(--accent-strong)",
};

const COLOR_VARS: Record<ModelCategory, { strong: string; light: string }> = {
    image: {
        strong: "rgb(var(--primary-strong))",
        light: "rgb(var(--primary-light))",
    },
    text: {
        strong: "rgb(var(--secondary-strong))",
        light: "rgb(var(--secondary-light))",
    },
    audio: {
        strong: "rgb(var(--tertiary-strong))",
        light: "rgb(var(--tertiary-light))",
    },
    video: {
        strong: "rgb(var(--accent-strong))",
        light: "rgb(var(--accent-light))",
    },
};

function getModelCategory(m: Model): ModelCategory {
    if (m.hasVideoOutput) return "video";
    if (m.hasAudioOutput || m.type === "audio") return "audio";
    if (m.type === "image") return "image";
    return "text";
}

/**
 * ModelSelector Component
 * Unified model selection UI used in both Create and Watch views
 * Shows image/text/audio/video models with color-coded filter tabs
 * Memoized to prevent unnecessary re-renders
 */
export const ModelSelector = memo(function ModelSelector({
    models,
    selectedModel,
    onSelectModel,
    showLegend = true,
    allowedImageModelIds,
    allowedTextModelIds,
    allowedAudioModelIds,
}: ModelSelectorProps) {
    const { copy } = usePageCopy(PLAY_PAGE);
    const [activeCategory, setActiveCategory] =
        useState<ModelCategory>("image");

    const categories: { key: ModelCategory; label: string }[] = [
        { key: "image", label: copy.imageLabel },
        { key: "text", label: copy.textLabel },
        { key: "audio", label: copy.audioLabel },
        { key: "video", label: copy.videoLabel },
    ];

    const filteredModels = models.filter(
        (m) => getModelCategory(m) === activeCategory,
    );

    return (
        <div className="mb-6">
            {showLegend && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {categories.map(({ key, label }) => (
                        <Button
                            key={key}
                            type="button"
                            variant="toggle-glow"
                            data-active={activeCategory === key}
                            onClick={() => setActiveCategory(key)}
                            className="px-2 py-1 text-sm md:px-4 md:py-2 md:text-base"
                            style={
                                {
                                    "--glow": CATEGORY_GLOW[key],
                                } as React.CSSProperties
                            }
                        >
                            {label}
                        </Button>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                {filteredModels.map((m) => {
                    const modelType = getModelCategory(m);
                    const isActive = selectedModel === m.id;
                    const isPaidOnly = m.paid_only;
                    const isImage = m.type === "image";
                    const isAudio = m.type === "audio";
                    const allowedSet = isImage
                        ? allowedImageModelIds
                        : isAudio
                          ? allowedAudioModelIds
                          : allowedTextModelIds;
                    const isAllowed = allowedSet.has(m.id);
                    const borderColor = isActive
                        ? COLOR_VARS[modelType].strong
                        : COLOR_VARS[modelType].light;

                    return (
                        <div key={m.id} className="relative group">
                            <Button
                                type="button"
                                onClick={() => isAllowed && onSelectModel(m.id)}
                                variant="model"
                                size={null}
                                data-active={isActive}
                                data-type={modelType}
                                disabled={!isAllowed}
                                title={m.description || m.id}
                                className={`border-2 ${
                                    !isAllowed
                                        ? "opacity-40 cursor-not-allowed grayscale"
                                        : ""
                                }`}
                                style={{ borderColor }}
                            >
                                {m.description?.split(" - ")[0] || m.name}
                                {isPaidOnly && (
                                    <span className="ml-1 text-[9px] font-black uppercase tracking-wider text-indicator-warning">
                                        💎
                                    </span>
                                )}
                            </Button>
                            {!isAllowed && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-dark text-xs rounded-input shadow-lg border border-border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    {copy.gatedModelTooltip}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-input-background" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
