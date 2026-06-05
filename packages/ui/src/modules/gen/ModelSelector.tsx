import type { ModelCategory } from "@pollinations/sdk";
import { cn } from "../../lib/cn.ts";
import { Button } from "../../primitives/Button.tsx";
import { ChevronIcon } from "../../primitives/ChevronIcon.tsx";
import { Chip } from "../../primitives/Chip.tsx";
import { Dropdown } from "../../primitives/Dropdown.tsx";
import { ScrollArea } from "../../primitives/ScrollArea.tsx";
import { TabButton } from "../../primitives/TabButton.tsx";
import { modalityTheme } from "./themes.ts";

export type ModelSelectorCategory = ModelCategory;

export type ModelSelectorItem = {
    id: string;
    name: string;
    description?: string;
    category: ModelSelectorCategory;
    paidOnly?: boolean;
};

export type ModelSelectorProps = {
    models: readonly ModelSelectorItem[];
    category: ModelSelectorCategory;
    value: string;
    isLoading?: boolean;
    onChange: (modelId: string) => void;
};

export const CATEGORY_LABELS: Record<ModelSelectorCategory, string> = {
    image: "Image",
    video: "Video",
    text: "Text",
    audio: "Audio",
    embedding: "Embeddings",
    realtime: "Realtime",
};

/** Human-readable label for a model category, e.g. "embedding" -> "Embeddings". */
export function categoryLabel(category: ModelSelectorCategory): string {
    return CATEGORY_LABELS[category];
}

function displayModelName(model: ModelSelectorItem): string {
    return model.description?.split(" - ")[0] || model.name;
}

export function ModelSelector({
    models,
    category,
    value,
    isLoading = false,
    onChange,
}: ModelSelectorProps) {
    const filteredModels = models.filter(
        (model) => model.category === category,
    );
    const currentModel = models.find((model) => model.id === value);
    const theme = modalityTheme(category);
    const modelLabel = currentModel ? displayModelName(currentModel) : "Select";
    const accessibleLabel = currentModel
        ? `${CATEGORY_LABELS[category]} model: ${modelLabel}`
        : `Select ${CATEGORY_LABELS[category].toLowerCase()} model`;

    return (
        <Dropdown
            theme={theme}
            align="end"
            className="polli:w-[min(24rem,calc(100vw-2rem))] polli:p-2"
            trigger={(open) => (
                <Button
                    type="button"
                    theme={theme}
                    aria-label={accessibleLabel}
                    className="polli:min-w-64 polli:max-w-full polli:self-start polli:justify-between polli:gap-2"
                >
                    <span className="polli:truncate">{modelLabel}</span>
                    <ChevronIcon expanded={open} />
                </Button>
            )}
        >
            {(close) =>
                isLoading ? (
                    <p className="polli:m-0 polli:px-2 polli:py-2 polli:text-sm polli:text-theme-text-soft">
                        Loading models...
                    </p>
                ) : (
                    <ScrollArea
                        theme={theme}
                        className="polli:max-h-64 polli:pr-2"
                    >
                        <div className="polli:flex polli:flex-col polli:gap-1">
                            {filteredModels.map((model) => {
                                const isActive = value === model.id;
                                return (
                                    <TabButton
                                        key={model.id}
                                        active={isActive}
                                        theme={modalityTheme(model.category)}
                                        size="sm"
                                        variant="ghost"
                                        className="polli:w-full polli:justify-between polli:text-left"
                                        onClick={() => {
                                            onChange(model.id);
                                            close();
                                        }}
                                    >
                                        <span className="polli:truncate">
                                            {displayModelName(model)}
                                        </span>
                                        {model.paidOnly && (
                                            <Chip
                                                size="sm"
                                                className={cn(
                                                    "polli:shrink-0",
                                                    isActive &&
                                                        "polli:bg-surface-white",
                                                )}
                                            >
                                                paid
                                            </Chip>
                                        )}
                                    </TabButton>
                                );
                            })}
                        </div>
                    </ScrollArea>
                )
            }
        </Dropdown>
    );
}
