import { memo } from "react";
import { PLAY_PAGE } from "../../../copy/content/play";
import type { Model } from "../../../hooks/useModelList";
import { useCopy } from "../../contexts/CopyContext";
import { Button } from "../ui/button";

interface ModelSelectorProps {
    models: Model[];
    selectedModel: string;
    onSelectModel: (id: string) => void;
    showLegend?: boolean;
    allowedImageModelIds: Set<string>;
    allowedTextModelIds: Set<string>;
}

/**
 * ModelSelector Component
 * Unified model selection UI used in both Create and Watch views
 * Shows image/text/audio models with color indicators
 * Memoized to prevent unnecessary re-renders
 */
export const ModelSelector = memo(function ModelSelector({
    models,
    selectedModel,
    onSelectModel,
    showLegend = true,
    allowedImageModelIds,
    allowedTextModelIds,
}: ModelSelectorProps) {
    // Get translated copy
    const { processedCopy } = useCopy();
    const copy = (
        processedCopy?.modelsLabel ? processedCopy : PLAY_PAGE
    ) as typeof PLAY_PAGE;

    return (
        <div className="mb-6">
            {showLegend && (
                <div className="flex items-center gap-4 mb-3">
                    <div className="font-headline text-text-body-main uppercase text-xs tracking-wider font-black">
                        {copy.modelsLabel.text}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-headline uppercase tracking-wider font-black">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-indicator-image" />
                            <span className="text-text-caption">
                                {copy.imageLabel.text}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-indicator-text" />
                            <span className="text-text-caption">
                                {copy.textLabel.text}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-indicator-audio" />
                            <span className="text-text-caption">
                                {copy.audioLabel.text}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-indicator-video" />
                            <span className="text-text-caption">
                                {copy.videoLabel.text}
                            </span>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                {models.map((m) => {
                    const hasVideoOutput = m.hasVideoOutput;
                    const hasAudioOutput = m.hasAudioOutput;
                    const isImage = m.type === "image";

                    // Priority: video > audio > image > text
                    const modelType = hasVideoOutput
                        ? "video"
                        : hasAudioOutput
                          ? "audio"
                          : isImage
                            ? "image"
                            : "text";
                    const isActive = selectedModel === m.id;
                    const allowedSet =
                        m.type === "image"
                            ? allowedImageModelIds
                            : allowedTextModelIds;
                    const isAllowed = allowedSet.has(m.id);

                    const borderColorClass = hasVideoOutput
                        ? "border-indicator-video"
                        : hasAudioOutput
                          ? "border-indicator-audio"
                          : isImage
                            ? "border-indicator-image"
                            : "border-indicator-text";

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
                                className={`border-2 ${borderColorClass} ${
                                    !isAllowed
                                        ? "opacity-40 cursor-not-allowed grayscale"
                                        : ""
                                }`}
                            >
                                {m.name}
                            </Button>
                            {!isAllowed && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-charcoal text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    {copy.gatedModelTooltip.text}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-charcoal" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
