import { EditableCombobox } from "@pollinations/ui";
import { useEffect, useState } from "react";
import {
    fetchModelCatalog,
    getCatalogCategory,
    getCatalogModelId,
} from "../models/model-catalog.ts";

export function BaseModelInput({
    value,
    disabled,
    onChange,
}: {
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    useEffect(() => {
        let cancelled = false;
        fetchModelCatalog()
            .then((models) => {
                if (cancelled) return;
                setModelOptions(
                    models
                        .filter(
                            (model) =>
                                getCatalogCategory(model) === "text" &&
                                model.agent !== true,
                        )
                        .map(getCatalogModelId)
                        .filter(Boolean)
                        .sort((a, b) => a.localeCompare(b)),
                );
            })
            .catch(() => {
                if (!cancelled) setModelOptions([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <EditableCombobox
            name="prompt-agent-base-model"
            value={value}
            options={modelOptions}
            placeholder="openai"
            align="end"
            emptyMessage="No models match. You can still type any model ID."
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={disabled}
            onChange={onChange}
        />
    );
}
