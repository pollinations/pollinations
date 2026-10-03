import {
    AudioIcon,
    ImageIcon,
    RobotIcon,
    TabButton,
    Tooltip,
    VideoIcon,
} from "@pollinations/ui";
import { memo, useEffect, useState } from "react";
import { PLAY_PAGE } from "../../../copy/content/play";
import type { Model } from "../../../hooks/useModelList";
import { usePageCopy } from "../../../hooks/usePageCopy";

type ModelCategory = "image" | "text" | "audio" | "video";

interface ModelSelectorProps {
    models: Model[];
    selectedModel: string;
    onSelectModel: (id: string) => void;
    showLegend?: boolean;
    allowedImageModelIds: Set<string>;
    allowedTextModelIds: Set<string>;
    allowedAudioModelIds: Set<string>;
    isLoading?: boolean;
    isLoggedIn?: boolean;
}

const CATEGORY_ICON = {
    text: RobotIcon,
    image: ImageIcon,
    video: VideoIcon,
    audio: AudioIcon,
} as const;

function getModelCategory(m: Model): ModelCategory {
    if (m.hasVideoOutput) return "video";
    if (m.hasAudioOutput || m.type === "audio") return "audio";
    if (m.type === "image") return "image";
    return "text";
}

/**
 * ModelSelector Component
 * Unified model selection UI used in both Create and Watch views
 * Shows image/text/audio/video models with filter tabs
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
    isLoading = false,
    isLoggedIn = false,
}: ModelSelectorProps) {
    const { copy } = usePageCopy(PLAY_PAGE);
    const [activeCategory, setActiveCategory] =
        useState<ModelCategory>("image");

    // Keep the visible category tab on the selected model (e.g. when
    // preselected via /play?model=<id>).
    useEffect(() => {
        const selected = models.find((m) => m.id === selectedModel);
        if (selected) {
            setActiveCategory(getModelCategory(selected));
        }
    }, [models, selectedModel]);

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
        <div className="flex flex-col gap-4">
            {showLegend && (
                <div className="flex min-w-0 flex-wrap gap-2">
                    {categories.map(({ key, label }) => {
                        const CategoryIcon = CATEGORY_ICON[key];
                        return (
                            <TabButton
                                key={key}
                                active={activeCategory === key}
                                size="lg"
                                className="gap-2"
                                onClick={() => setActiveCategory(key)}
                            >
                                <CategoryIcon className="h-4 w-4 shrink-0" />
                                {label}
                            </TabButton>
                        );
                    })}
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                {isLoading
                    ? ["s1", "s2", "s3", "s4"].map((k) => (
                          <div
                              key={k}
                              aria-hidden="true"
                              className="h-9 w-24 animate-pulse rounded-full bg-theme-bg-subtle"
                          />
                      ))
                    : filteredModels.map((m) => {
                          const isActive = selectedModel === m.id;
                          const isImage = m.type === "image";
                          const isAudio = m.type === "audio";
                          const allowedSet = isImage
                              ? allowedImageModelIds
                              : isAudio
                                ? allowedAudioModelIds
                                : allowedTextModelIds;
                          const isAllowed = allowedSet.has(m.id);
                          const button = (
                              <TabButton
                                  key={m.id}
                                  active={isActive}
                                  size="sm"
                                  onClick={() =>
                                      isAllowed && onSelectModel(m.id)
                                  }
                                  disabled={!isAllowed}
                                  title={m.description || m.id}
                                  detail={m.paid_only ? "💎" : undefined}
                              >
                                  {m.title}
                              </TabButton>
                          );

                          return isAllowed ? (
                              button
                          ) : (
                              <Tooltip
                                  key={m.id}
                                  triggerAs="span"
                                  align="center"
                                  content={
                                      isLoggedIn
                                          ? copy.gatedModelTooltipLoggedIn
                                          : copy.gatedModelTooltip
                                  }
                              >
                                  {button}
                              </Tooltip>
                          );
                      })}
            </div>
        </div>
    );
});
