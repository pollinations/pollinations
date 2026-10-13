import { ButtonGroup, TabButton } from "@pollinations/ui";
import {
    CATEGORY_LABELS,
    MODEL_CATEGORY_ORDER,
} from "../models/model-categories.ts";
import { readModelSelection, writeModelSelection } from "./model-selection.ts";

export function ModelPermissionsInput({
    selected,
    onChange,
    disabled = false,
}: {
    selected: string[] | null;
    onChange: (models: string[] | null) => void;
    disabled?: boolean;
}) {
    const { categories, models } = readModelSelection(selected);
    const toggle = (category: (typeof MODEL_CATEGORY_ORDER)[number]) => {
        const next = new Set(categories);
        if (next.has(category)) next.delete(category);
        else next.add(category);
        onChange(writeModelSelection({ categories: next, models }));
    };
    return (
        <ButtonGroup
            aria-label="Model categories"
            className="col-span-2 row-start-2 pl-8 sm:pl-0 sm:col-span-1 sm:col-start-2 sm:row-start-1"
        >
            {MODEL_CATEGORY_ORDER.map((category) => (
                <TabButton
                    key={category}
                    size="xs"
                    active={categories.has(category)}
                    disabled={disabled}
                    onClick={() => toggle(category)}
                >
                    {CATEGORY_LABELS[category]}
                </TabButton>
            ))}
            {/* Model IDs come from the API, the CLI or an app's authorize
                link; here they can only be removed. */}
            {models.map((id) => (
                <TabButton
                    key={id}
                    size="xs"
                    active
                    disabled={disabled}
                    ariaLabel={`Remove ${id}`}
                    onClick={() =>
                        onChange(
                            writeModelSelection({
                                categories,
                                models: models.filter((value) => value !== id),
                            }),
                        )
                    }
                >
                    {id}
                </TabButton>
            ))}
        </ButtonGroup>
    );
}
