import { EditableCombobox } from "@pollinations/ui";
import { useMemo } from "react";
import { getModelPricesFromCatalog } from "../models/model-catalog.ts";
import { useModelCategories } from "../models/use-model-categories.ts";
import { useModelQuerySearch } from "../models/use-model-query-search.tsx";

/** Text models only; the same filters as the permission picker, one pick. */
export function BaseModelInput({
    value,
    disabled,
    onChange,
}: {
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    const { catalog } = useModelCategories();
    const textModels = useMemo(
        () =>
            getModelPricesFromCatalog(catalog).filter(
                (model) => model.type === "text" && !model.agent,
            ),
        [catalog],
    );
    const { comboboxProps } = useModelQuerySearch({
        models: textModels,
        initial: ["source:official", value].filter(Boolean).join(" "),
        pickable: true,
        onTextChange: onChange,
    });

    return (
        <EditableCombobox
            {...comboboxProps}
            name="prompt-agent-base-model"
            aria-label="Base model"
            placeholder={value ? comboboxProps.placeholder : "openai"}
            align="end"
            emptyMessage="No models match. You can still type any model ID."
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={disabled}
        />
    );
}
