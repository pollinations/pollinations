import { Button, ButtonGroup, ChevronIcon, TabButton } from "@pollinations/ui";
import { useState } from "react";
import { ConsentModelPicker } from "../auth/consent-model-picker.tsx";
import type { ApiModelInfo } from "../models/model-catalog.ts";
import type {
    ModelCategoryGroup,
    ModelCategoryModel,
} from "../models/model-categories.ts";

type ModelTab = ModelCategoryGroup["modality"] | "other";

const TAB_LABELS: Record<ModelTab, string> = {
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
    const [activeTab, setActiveTab] = useState<ModelTab | "selected" | null>(
        null,
    );
    const offeredIds = new Set(models.map(({ id }) => id));
    const categorizedIds = new Set<string>();
    const idsByTab = new Map<ModelTab, Set<string>>();
    for (const group of categories) {
        for (const { id } of group.models) {
            if (!offeredIds.has(id) || categorizedIds.has(id)) continue;
            const ids = idsByTab.get(group.modality) ?? new Set<string>();
            ids.add(id);
            idsByTab.set(group.modality, ids);
            categorizedIds.add(id);
        }
    }
    const otherIds = models.filter(({ id }) => !categorizedIds.has(id));
    if (otherIds.length) {
        idsByTab.set("other", new Set(otherIds.map(({ id }) => id)));
    }
    const selectedIds = new Set(selected ?? models.map(({ id }) => id));
    const hasSelectedModels = models.some(({ id }) => selectedIds.has(id));
    const shownTabs = [...idsByTab].filter(
        ([, ids]) =>
            activeTab !== null || [...ids].some((id) => selectedIds.has(id)),
    );
    const displayedModels = models.filter(({ id }) =>
        activeTab === "selected"
            ? selectedIds.has(id)
            : activeTab !== null && idsByTab.get(activeTab)?.has(id),
    );
    return (
        <>
            {(activeTab !== null || hasSelectedModels) && (
                <ButtonGroup
                    aria-label="Model categories"
                    className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"
                >
                    {shownTabs.map(([tab]) => (
                        <TabButton
                            key={tab}
                            size="xs"
                            active={activeTab === tab}
                            disabled={disabled || activeTab === null}
                            onClick={() => setActiveTab(tab)}
                        >
                            {TAB_LABELS[tab]}
                        </TabButton>
                    ))}
                    {activeTab !== null && (
                        <TabButton
                            size="xs"
                            active={activeTab === "selected"}
                            disabled={disabled}
                            onClick={() => setActiveTab("selected")}
                        >
                            Selected
                        </TabButton>
                    )}
                </ButtonGroup>
            )}
            <Button
                type="button"
                size="sm"
                intent="neutral"
                className="col-start-2 row-start-1 justify-self-end sm:col-start-3"
                aria-label={
                    activeTab === null
                        ? "Expand model selector"
                        : "Collapse model selector"
                }
                aria-expanded={activeTab !== null}
                disabled={disabled}
                onClick={() =>
                    setActiveTab(activeTab === null ? "selected" : null)
                }
            >
                <ChevronIcon expanded={activeTab !== null} />
            </Button>
            {activeTab !== null && (
                <div className="col-span-2 w-full pt-2 sm:col-span-3">
                    <ConsentModelPicker
                        key={activeTab}
                        catalog={catalog}
                        allModels={models}
                        models={displayedModels}
                        selected={selected}
                        onChange={onChange}
                        disabled={disabled}
                    />
                </div>
            )}
        </>
    );
}
