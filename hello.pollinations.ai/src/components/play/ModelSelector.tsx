import { memo } from "react";
import { Button } from "../ui/button";
import { TextGenerator } from "../TextGenerator";
import { PLAY_PAGE } from "../../config/content";

/**
 * ModelSelector Component
 * Unified model selection UI used in both Create and Watch views
 * Shows image/text/audio models with color indicators
 * Memoized to prevent unnecessary re-renders
 */
import { Model } from "../../hooks/useModelList";

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
                    <div className="font-headline text-offblack uppercase text-xs tracking-wider font-black">
                        <TextGenerator content={PLAY_PAGE.modelsLabel} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-headline uppercase tracking-wider font-black">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-rose border border-offblack" />
                            <span className="text-offblack/50">
                                <TextGenerator content={PLAY_PAGE.imageLabel} />
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-lime border border-offblack" />
                            <span className="text-offblack/50">
                                <TextGenerator content={PLAY_PAGE.textLabel} />
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-cyan border border-offblack" />
                            <span className="text-offblack/50">Audio</span>
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

                    const colorClass = hasAudioOutput
                        ? "bg-cyan"
                        : isImage
                        ? "bg-rose"
                        : "bg-lime";

                    return (
                        <Button
                            key={m.id}
                            type="button"
                            onClick={() => onSelectModel(m.id)}
                            variant="model"
                            size={null}
                            data-active={isActive}
                            data-type={modelType}
                        >
                            <div
                                className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass}`}
                            />
                            {m.name}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
});
