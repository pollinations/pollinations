import {
    Button,
    ButtonGroup,
    ChevronIcon,
    Chip,
    TabButton,
    Text,
} from "@pollinations/ui";
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
    const [activeTab, setActiveTab] = useState<
        ModelTab | "selected" | "all" | null
    >(null);
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
    const selectedCategories = [...idsByTab]
        .filter(([, ids]) => [...ids].some((id) => selectedIds.has(id)))
        .map(([tab]) => TAB_LABELS[tab]);
    const summary =
        selected === null
            ? "All models"
            : selectedIds.size === 0
              ? "Generation disabled"
              : `${selectedIds.size} ${selectedIds.size === 1 ? "model" : "models"}`;
    const displayedModels = models.filter(({ id }) => {
        if (activeTab === "all") return true;
        if (activeTab === "selected") return selectedIds.has(id);
        return activeTab !== null && idsByTab.get(activeTab)?.has(id);
    });
    return (
        <>
            {activeTab === null ? (
                <Text
                    as="div"
                    size="sm"
                    className="polli:min-h-8 polli:leading-5 col-span-2 row-start-2 flex min-w-0 flex-wrap items-start gap-x-3 sm:col-span-1 sm:col-start-2 sm:row-start-1"
                >
                    {selectedCategories.length > 0 && (
                        <span className="flex min-w-0 flex-wrap gap-x-1">
                            {selectedCategories.map((category) => (
                                <span
                                    key={category}
                                    className="inline-flex h-8 items-center"
                                >
                                    <Chip
                                        size="sm"
                                        className="polli:text-sm polli:leading-5"
                                    >
                                        {category}
                                    </Chip>
                                </span>
                            ))}
                        </span>
                    )}
                    <span className="inline-flex h-8 items-center whitespace-nowrap text-xs text-theme-text-muted">
                        {summary}
                    </span>
                </Text>
            ) : (
                <ButtonGroup
                    aria-label="Model categories"
                    className="col-span-2 row-start-2 py-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1"
                >
                    <TabButton
                        size="xs"
                        active={activeTab === "selected"}
                        disabled={disabled}
                        onClick={() => setActiveTab("selected")}
                    >
                        Selected
                    </TabButton>
                    <TabButton
                        size="xs"
                        className="mr-2"
                        active={activeTab === "all"}
                        disabled={disabled}
                        onClick={() => setActiveTab("all")}
                    >
                        All
                    </TabButton>
                    {[...idsByTab].map(([tab]) => (
                        <TabButton
                            key={tab}
                            size="xs"
                            active={activeTab === tab}
                            disabled={disabled}
                            onClick={() => setActiveTab(tab)}
                        >
                            {TAB_LABELS[tab]}
                        </TabButton>
                    ))}
                </ButtonGroup>
            )}
            <div className="col-start-2 row-start-1 flex h-8 items-center justify-self-end sm:col-start-3">
                <Button
                    type="button"
                    size="sm"
                    intent="neutral"
                    className="gap-1.5"
                    aria-label={
                        activeTab === null
                            ? "Choose models"
                            : "Collapse model selector"
                    }
                    aria-expanded={activeTab !== null}
                    disabled={disabled}
                    onClick={() =>
                        setActiveTab(activeTab === null ? "selected" : null)
                    }
                >
                    {activeTab === null && <span>Choose models</span>}
                    <ChevronIcon expanded={activeTab !== null} />
                </Button>
            </div>
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
