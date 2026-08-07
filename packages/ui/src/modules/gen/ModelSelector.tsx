import type { ModelCategory, ModelInfo } from "@pollinations/sdk";
import { cn } from "../../lib/cn.ts";
import { Button } from "../../primitives/Button.tsx";
import { ChevronIcon } from "../../primitives/ChevronIcon.tsx";
import { Dropdown } from "../../primitives/Dropdown.tsx";
import { CardIcon, SproutIcon } from "../../primitives/icons/index.tsx";
import { ScrollArea } from "../../primitives/ScrollArea.tsx";
import { TabButton } from "../../primitives/TabButton.tsx";

export type ModelSelectorCategory = ModelCategory;

type ModelSelectorProps = {
    models: readonly ModelInfo[];
    category: ModelSelectorCategory;
    value: string;
    isLoading?: boolean;
    /** Extra classes for the trigger button, e.g. to match sibling controls. */
    className?: string;
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

/**
 * Card = needs a paid balance; sprout = runs on any Pollen. Trails the model
 * name so the name stays the thing you scan the list by.
 */
function AccessIcon({ paidOnly }: { paidOnly?: boolean }) {
    return paidOnly ? (
        <CardIcon className="polli:h-3.5 polli:w-3.5 polli:shrink-0" />
    ) : (
        <SproutIcon className="polli:h-3.5 polli:w-3.5 polli:shrink-0" />
    );
}

function modelId(model: ModelInfo): string {
    return model.id ?? model.name;
}

export function ModelSelector({
    models,
    category,
    value,
    isLoading = false,
    className,
    onChange,
}: ModelSelectorProps) {
    const filteredModels = models
        .filter((model) => model.category === category)
        .sort((a, b) => modelId(a).localeCompare(modelId(b)));
    const currentModel = models.find((model) => modelId(model) === value);
    const modelLabel = currentModel
        ? (currentModel.title ?? currentModel.name)
        : "Select";
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
                    className={cn(
                        "polli:min-w-64 polli:max-w-full polli:self-start polli:justify-between polli:gap-2",
                        className,
                    )}
                >
                    <span className="polli:flex polli:min-w-0 polli:items-center polli:gap-2">
                        <span className="polli:truncate">{modelLabel}</span>
                        {currentModel && (
                            <AccessIcon paidOnly={currentModel.paid_only} />
                        )}
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
                    <ScrollArea className="polli:max-h-80 polli:pr-2">
                        <div className="polli:flex polli:flex-col polli:gap-1">
                            {filteredModels.map((model) => {
                                const id = modelId(model);
                                const isActive = value === id;
                                return (
                                    <TabButton
                                        key={id}
                                        active={isActive}
                                        size="sm"
                                        variant="ghost"
                                        className="polli:w-full polli:justify-start polli:text-left"
                                        onClick={() => {
                                            onChange(id);
                                            close();
                                        }}
                                    >
                                        <span className="polli:flex polli:min-w-0 polli:flex-col polli:gap-0.5">
                                            <span className="polli:flex polli:min-w-0 polli:items-center polli:gap-2">
                                                <span className="polli:truncate">
                                                    {model.title ?? model.name}
                                                </span>
                                                <AccessIcon
                                                    paidOnly={model.paid_only}
                                                />
                                            </span>
                                            {model.description && (
                                                <span className="polli:truncate polli:text-xs polli:font-normal polli:text-theme-text-muted">
                                                    {model.description}
                                                </span>
                                            )}
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
