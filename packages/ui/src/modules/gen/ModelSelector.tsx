import type { ModelCategory } from "@pollinations/sdk";
import { Button } from "../../primitives/Button.tsx";
import { ChevronIcon } from "../../primitives/ChevronIcon.tsx";
import { Dropdown } from "../../primitives/Dropdown.tsx";
import { CardIcon, SproutIcon } from "../../primitives/icons/index.tsx";
import { ScrollArea } from "../../primitives/ScrollArea.tsx";
import { TabButton } from "../../primitives/TabButton.tsx";

export type ModelSelectorCategory = ModelCategory;

type ModelSelectorItem = {
    id: string;
    name: string;
    title: string;
    description?: string;
    category: ModelSelectorCategory;
    paidOnly?: boolean;
};

type ModelSelectorProps = {
    models: readonly ModelSelectorItem[];
    category: ModelSelectorCategory;
    value: string;
    isLoading?: boolean;
    onChange: (modelId: string) => void;
};

const CATEGORY_LABELS: Record<ModelSelectorCategory, string> = {
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
    const modelLabel = currentModel?.title ?? "Select";
    const accessibleLabel = currentModel
        ? `${CATEGORY_LABELS[category]} model: ${modelLabel}`
        : `Select ${CATEGORY_LABELS[category].toLowerCase()} model`;

    return (
        <Dropdown
            align="start"
            className="polli:w-[min(24rem,calc(100vw-2rem))] polli:p-2"
            trigger={(open) => (
                <Button
                    type="button"
                    aria-label={accessibleLabel}
                    className="polli:min-w-64 polli:max-w-full polli:self-start polli:justify-between polli:gap-2"
                >
                    <span className="polli:flex polli:min-w-0 polli:items-center polli:gap-2">
                        {currentModel &&
                            (currentModel.paidOnly ? (
                                <CardIcon className="polli:h-3.5 polli:w-3.5 polli:shrink-0" />
                            ) : (
                                <SproutIcon className="polli:h-3.5 polli:w-3.5 polli:shrink-0" />
                            ))}
                        <span className="polli:truncate">{modelLabel}</span>
                    </span>
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
                    <ScrollArea className="polli:max-h-64 polli:pr-2">
                        <div className="polli:flex polli:flex-col polli:gap-1">
                            {filteredModels.map((model) => {
                                const isActive = value === model.id;
                                return (
                                    <TabButton
                                        key={model.id}
                                        active={isActive}
                                        size="sm"
                                        variant="ghost"
                                        className="polli:w-full polli:justify-start polli:text-left"
                                        onClick={() => {
                                            onChange(model.id);
                                            close();
                                        }}
                                    >
                                        <span className="polli:flex polli:min-w-0 polli:items-center polli:gap-2">
                                            {model.paidOnly ? (
                                                <CardIcon className="polli:h-3.5 polli:w-3.5 polli:shrink-0" />
                                            ) : (
                                                <SproutIcon className="polli:h-3.5 polli:w-3.5 polli:shrink-0" />
                                            )}
                                            <span className="polli:truncate">
                                                {model.title}
                                            </span>
                                        </span>
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
