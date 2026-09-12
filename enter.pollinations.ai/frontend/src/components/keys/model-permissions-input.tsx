import { Chip, Collapsible } from "@pollinations/ui";
import { useState } from "react";
import { ConsentModelPicker } from "../auth/consent-model-picker.tsx";
import type { ApiModelInfo } from "../models/model-catalog.ts";
import {
    getSelectedModelCounts,
    type ModelCategoryGroup,
    type ModelCategoryModel,
} from "../models/model-categories.ts";

export function ModelPermissionsInput({
    catalog,
    categories,
    models,
    selected,
    onChange,
    disabled = false,
    initiallyExpanded = false,
}: {
    catalog: ApiModelInfo[];
    categories: ModelCategoryGroup[];
    models: ModelCategoryModel[];
    selected: string[] | null;
    onChange: (models: string[]) => void;
    disabled?: boolean;
    initiallyExpanded?: boolean;
}) {
    const [expanded, setExpanded] = useState(initiallyExpanded);
    const counts = getSelectedModelCounts(
        selected,
        models.map(({ id }) => id),
        categories,
    );
    return (
        <Collapsible
            label={
                <span className="flex flex-wrap items-center gap-2">
                    <span>Models</span>
                    <span className="flex min-w-0 flex-wrap gap-1.5">
                        {counts.map(({ modality, label, count }) => (
                            <Chip key={modality} size="sm" intent="neutral">
                                {label} · {count}
                            </Chip>
                        ))}
                        {counts.length === 0 && (
                            <Chip size="sm" intent="neutral">
                                None selected
                            </Chip>
                        )}
                    </span>
                </span>
            }
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            disabled={disabled}
            wrapperClassName="polli:border-0"
            triggerClassName="polli:px-0 polli:text-sm polli:font-semibold"
            hoverClassName="polli:hover:bg-transparent"
            panelClassName="polli:pt-2"
        >
            <ConsentModelPicker
                catalog={catalog}
                models={models}
                selected={selected}
                onChange={onChange}
                disabled={disabled}
            />
        </Collapsible>
    );
}
