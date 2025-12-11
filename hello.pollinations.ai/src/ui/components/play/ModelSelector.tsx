import { memo } from "react";
import { Button } from "../ui/button";
import { PLAY_PAGE } from "../../../theme";

/**
 * ModelSelector Component
 * Unified model selection UI used in both Create and Watch views
 * Shows image/text/audio models with color indicators
 * Memoized to prevent unnecessary re-renders
 */
import { Model } from "../../../hooks/useModelList";

interface ModelSelectorProps {
    models: Model[];
    selectedModel: string;
    onSelectModel: (id: string) => void;
    showLegend?: boolean;
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
}: ModelSelectorProps) {
    return (
        <div className="mb-6">
            {showLegend && (
                <div className="flex items-center gap-4 mb-3">
                    <div className="font-headline text-text-body-main uppercase text-xs tracking-wider font-black">
                        {PLAY_PAGE.modelsLabel.text}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-headline uppercase tracking-wider font-black">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-indicator-image border border-border-strong" />
                            <span className="text-text-caption">
                                {PLAY_PAGE.imageLabel.text}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-indicator-text border border-border-strong" />
                            <span className="text-text-caption">
                                {PLAY_PAGE.textLabel.text}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-indicator-audio border border-border-strong" />
                            <span className="text-text-caption">Audio</span>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                {models.map((m) => {
                    const hasAudioOutput = m.hasAudioOutput;
                    const isImage = m.type === "image";
                    const modelType = hasAudioOutput
                        ? "audio"
                        : isImage
                        ? "image"
                        : "text";
                    const isActive = selectedModel === m.id;

                    const borderColorClass = hasAudioOutput
                        ? "border-indicator-audio"
                        : isImage
                        ? "border-indicator-image"
                        : "border-indicator-text";

                    return (
                        <Button
                            key={m.id}
                            type="button"
                            onClick={() => onSelectModel(m.id)}
                            variant="model"
                            size={null}
                            data-active={isActive}
                            data-type={modelType}
                            className={`border-2 ${borderColorClass}`}
                        >
                            {m.name}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
});
