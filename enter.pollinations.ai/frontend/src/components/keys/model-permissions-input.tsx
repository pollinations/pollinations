import { Button, ButtonGroup, ChevronIcon, TabButton } from "@pollinations/ui";
import { useState } from "react";
import { ConsentModelPicker } from "../auth/consent-model-picker.tsx";
import type { ApiModelInfo } from "../models/model-catalog.ts";
import type {
    ModelCategoryGroup,
    ModelCategoryModel,
} from "../models/model-categories.ts";
import {
    setConsentModelGroup,
    toggleConsentModelGroup,
} from "./model-selection.ts";

type ModelTab = ModelCategoryGroup["modality"] | "other" | "all";

const TAB_LABELS: Record<ModelTab, string> = {
    all: "All",
    text: "Text",
    images: "Image",
    video: "Video",
    "3d": "3D",
    audio: "Audio",
    realtime: "Realtime",
    embeddings: "Embedding",
    other: "Other",
};

export function ModelPermissionsInput({
    catalog,
    categories,
    models,
    selected,
    onChange,
    disabled = false,
}: {
    catalog: ApiModelInfo[];
    categories: ModelCategoryGroup[];
    models: ModelCategoryModel[];
    selected: string[] | null;
    onChange: (models: string[]) => void;
    disabled?: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const modelIds = models.map(({ id }) => id);
    const offeredIds = new Set(modelIds);
    const categorizedIds = new Set<string>();
    const idsByTab = new Map<ModelTab, string[]>([["all", modelIds]]);
    for (const group of categories) {
        for (const { id } of group.models) {
            if (!offeredIds.has(id) || categorizedIds.has(id)) continue;
            idsByTab.set(group.modality, [
                ...(idsByTab.get(group.modality) ?? []),
                id,
            ]);
            categorizedIds.add(id);
        }
    }
    const otherIds = modelIds.filter((id) => !categorizedIds.has(id));
    if (otherIds.length) idsByTab.set("other", otherIds);
    const selectedIds = new Set(selected ?? modelIds);
    return (
        <>
            <ButtonGroup
                aria-label="Model categories"
                className="col-span-2 row-start-2 py-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1"
            >
                {[...idsByTab].map(([tab, ids]) => {
                    const count = ids.filter((id) =>
                        selectedIds.has(id),
                    ).length;
                    // All works like a select-all checkbox: a partial click
                    // fills it. Categories clear on a partial click instead.
                    const isAll = tab === "all";
                    const isFull = count === ids.length;
                    return (
                        <TabButton
                            key={tab}
                            size="xs"
                            className={isAll ? "mr-2" : undefined}
                            active={isFull ? true : count > 0 ? "mixed" : false}
                            disabled={disabled}
                            ariaLabel={`${TAB_LABELS[tab]}: ${count} of ${ids.length} models`}
                            detail={
                                <SelectionCount
                                    count={count}
                                    total={ids.length}
                                />
                            }
                            onClick={() =>
                                onChange(
                                    isAll
                                        ? setConsentModelGroup(
                                              selected,
                                              modelIds,
                                              ids,
                                              !isFull,
                                          )
                                        : toggleConsentModelGroup(
                                              selected,
                                              modelIds,
                                              ids,
                                          ),
                                )
                            }
                        >
                            {TAB_LABELS[tab]}
                        </TabButton>
                    );
                })}
            </ButtonGroup>
            <div className="col-start-2 row-start-1 flex h-8 items-center justify-self-end sm:col-start-3">
                <Button
                    type="button"
                    size="sm"
                    intent="neutral"
                    className="gap-1.5"
                    aria-label={
                        expanded ? "Collapse model selector" : "Choose models"
                    }
                    aria-expanded={expanded}
                    disabled={disabled}
                    onClick={() => setExpanded(!expanded)}
                >
                    {!expanded && <span>Choose models</span>}
                    <ChevronIcon expanded={expanded} />
                </Button>
            </div>
            {expanded && (
                <div className="col-span-2 w-full pt-2 sm:col-span-3">
                    <ConsentModelPicker
                        catalog={catalog}
                        allModels={models}
                        models={models}
                        selected={selected}
                        onChange={onChange}
                        disabled={disabled}
                    />
                </div>
            )}
        </>
    );
}

/** Reserves the widest count so toggling never resizes the chip. */
function SelectionCount({ count, total }: { count: number; total: number }) {
    return (
        <span className="inline-grid tabular-nums" aria-hidden>
            <span className="invisible col-start-1 row-start-1">
                {total}/{total}
            </span>
            <span className="col-start-1 row-start-1 text-right">
                {count}/{total}
            </span>
        </span>
    );
}
