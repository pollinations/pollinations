import { memo } from "react";
import { PLAY_PAGE } from "../../../copy/content/play";
import type { Model } from "../../../hooks/useModelList";
import { usePageCopy } from "../../../hooks/usePageCopy";
import { Button } from "../ui/button";

interface ModelSelectorProps {
    models: Model[];
    selectedModel: string;
    onSelectModel: (id: string) => void;
    showLegend?: boolean;
    allowedImageModelIds: Set<string>;
    allowedTextModelIds: Set<string>;
    allowedAudioModelIds: Set<string>;
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
    allowedAudioModelIds,
}: ModelSelectorProps) {
    // Get translated copy
    const { copy } = usePageCopy(PLAY_PAGE);

    return (
        <div className="mb-6">
            {showLegend && (
                <div className="flex items-center gap-4 mb-3">
                    <div className="font-headline text-dark uppercase text-sm tracking-wider font-black">
                        {copy.modelsLabel}
                    </div>
                    <div className="flex items-center gap-3 text-sm font-headline uppercase tracking-wider font-black">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-primary-light" />
                            <span className="text-subtle">
                                {copy.imageLabel}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-secondary-light" />
                            <span className="text-subtle">
                                {copy.textLabel}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-tertiary-light" />
                            <span className="text-subtle">
                                {copy.audioLabel}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-accent-strong" />
                            <span className="text-subtle">
                                {copy.videoLabel}
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
                    const isPaidOnly = m.paid_only;

                    const isAudio = m.type === "audio";

                    // Priority: video > audio (by output or type) > image > text
                    const modelType = hasVideoOutput
                        ? "video"
                        : hasAudioOutput || isAudio
                          ? "audio"
                          : isImage
                            ? "image"
                            : "text";
                    const isActive = selectedModel === m.id;
                    const allowedSet = isImage
                        ? allowedImageModelIds
                        : isAudio
                          ? allowedAudioModelIds
                          : allowedTextModelIds;
                    const isAllowed = allowedSet.has(m.id);

                    const borderColor = hasVideoOutput
                        ? "rgb(var(--accent-strong))"
                        : hasAudioOutput || isAudio
                          ? "rgb(var(--tertiary-light))"
                          : isImage
                            ? "rgb(var(--primary-light))"
                            : "rgb(var(--secondary-light))";

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
