import {
    Button,
    ButtonGroup,
    EditableCombobox,
    TabButton,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    setConsentModelGroup,
    toggleConsentModel,
} from "../keys/model-selection.ts";
import {
    type ApiModelInfo,
    getModelPricesFromCatalog,
} from "../models/model-catalog.ts";
import type { ModelCategoryModel } from "../models/model-categories.ts";
import { useModelQuerySearch } from "../models/use-model-query-search.tsx";

export function ConsentModelPicker({
    allModels,
    models,
    catalog,
    selected,
    onChange,
    disabled,
}: {
    allModels: ModelCategoryModel[];
    models: ModelCategoryModel[];
    catalog: ApiModelInfo[];
    selected: string[] | null;
    onChange: (models: string[]) => void;
    disabled: boolean;
}) {
    const requestedIds = allModels.map(({ id }) => id);
    const searchableModels = useMemo(() => {
        const offered = new Set(models.map(({ id }) => id));
        return getModelPricesFromCatalog(catalog).filter(({ name }) =>
            offered.has(name),
        );
    }, [catalog, models]);
    const { parsed, matches, comboboxProps } = useModelQuerySearch({
        models: searchableModels,
        initial: "",
    });
    const indexed = new Map(
        searchableModels.map((model) => [model.name, model]),
    );
    const visibleModels = models.filter((model) => {
        const metadata = indexed.get(model.id);
        return metadata
            ? matches(metadata)
            : parsed.filters.length === 0 &&
                  parsed.terms.every((term) =>
                      `${model.id} ${model.label}`.toLowerCase().includes(term),
                  );
    });
    const allShownSelected = visibleModels.every(
        ({ id }) => selected === null || selected.includes(id),
    );
    const anyShownSelected = visibleModels.some(
        ({ id }) => selected === null || selected.includes(id),
    );

    return (
        <div className="space-y-3">
            <div className="space-y-1">
                <EditableCombobox
                    {...comboboxProps}
                    disabled={disabled}
                    aria-label="Search and filter models"
                    autoComplete="off"
                />
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button
                        type="button"
                        size="xs"
                        className="polli:bg-transparent polli:px-0 polli:text-xs polli:font-normal polli:text-theme-text-soft polli:underline polli:underline-offset-2 polli:hover:bg-transparent"
                        disabled={disabled || !anyShownSelected}
                        onClick={() =>
                            onChange(
                                setConsentModelGroup(
                                    selected,
                                    requestedIds,
                                    visibleModels.map(({ id }) => id),
                                    false,
                                ),
                            )
                        }
                    >
                        Clear shown
                    </Button>
                    <Button
                        type="button"
                        size="xs"
                        className="polli:bg-transparent polli:px-0 polli:text-xs polli:font-normal polli:text-theme-text-soft polli:underline polli:underline-offset-2 polli:hover:bg-transparent"
                        disabled={disabled || allShownSelected}
                        onClick={() =>
                            onChange(
                                setConsentModelGroup(
                                    selected,
                                    requestedIds,
                                    visibleModels.map(({ id }) => id),
                                    true,
                                ),
                            )
                        }
                    >
                        Select all shown
                    </Button>
                </div>
            </div>
            <ButtonGroup aria-label="Requested models">
                {visibleModels.map((model) => {
                    const active =
                        selected === null || selected.includes(model.id);
                    return (
                        <TabButton
                            key={model.id}
                            active={active}
                            size="xs"
                            variant="ghost"
                            disabled={disabled}
                            onClick={() =>
                                onChange(
                                    toggleConsentModel(
                                        selected,
                                        requestedIds,
                                        model.id,
                                    ),
                                )
                            }
                        >
                            {model.label}
                        </TabButton>
                    );
                })}
            </ButtonGroup>
            {visibleModels.length === 0 && (
                <p className="text-xs text-theme-text-muted">
                    {models.length === 0
                        ? "No models selected. Choose a category to add one."
                        : "No models match these filters."}
                </p>
            )}
        </div>
    );
}
