import { ButtonGroup, TabButton } from "@pollinations/ui";
import {
    type ApiModelInfo,
    getCatalogCategory,
} from "../models/model-catalog.ts";
import {
    CATEGORY_LABELS,
    MODEL_CATEGORY_ORDER,
} from "../models/model-categories.ts";
import { readModelSelection, writeModelSelection } from "./model-selection.ts";

export function ModelPermissionsInput({
    catalog,
    selected,
    onChange,
    disabled = false,
}: {
    catalog: ApiModelInfo[];
    selected: string[] | null;
    onChange: (models: string[] | null) => void;
    disabled?: boolean;
}) {
    const { categories, unknown } = readModelSelection(selected, catalog);
    const isAll = selected === null;
    const toggle = (category: (typeof MODEL_CATEGORY_ORDER)[number]) => {
        const next = new Set(categories);
        if (next.has(category)) next.delete(category);
        else next.add(category);
        onChange(writeModelSelection({ categories: next, unknown }));
    };
    return (
        <ButtonGroup
            aria-label="Model categories"
            className="col-span-2 row-start-2 py-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1"
        >
            {/* All works like a select-all checkbox: a partial click fills it. */}
            <TabButton
                size="xs"
                className="mr-2"
                active={isAll ? true : categories.size > 0 ? "mixed" : false}
                disabled={disabled}
                onClick={() => onChange(isAll ? [] : null)}
            >
                All
            </TabButton>
            {MODEL_CATEGORY_ORDER.map((category) => {
                const count = catalog.filter(
                    (model) => getCatalogCategory(model) === category,
                ).length;
                const label = CATEGORY_LABELS[category];
                return (
                    <TabButton
                        key={category}
                        size="xs"
                        active={categories.has(category)}
                        disabled={disabled}
                        ariaLabel={`${label}: ${count} models`}
                        detail={count || undefined}
                        onClick={() => toggle(category)}
                    >
                        {label}
                    </TabButton>
                );
            })}
            {/* Requested IDs the catalog lacks stay visible until removed;
                before it loads, every ID would show here. */}
            {catalog.length > 0 &&
                unknown.map((id) => (
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
                                    unknown: unknown.filter(
                                        (value) => value !== id,
                                    ),
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
