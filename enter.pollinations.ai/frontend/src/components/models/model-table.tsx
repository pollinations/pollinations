import { type FC, useEffect, useRef, useState } from "react";
import { ModelRow } from "./model-row.tsx";
import type { ModelCategory } from "./model-search.ts";
import type { ModelPrice } from "./types.ts";

export type SectionType = ModelCategory;

type UnifiedModelTableProps = {
    listKey: string;
    allModels: ModelPrice[];
    imageModels: ModelPrice[];
    videoModels: ModelPrice[];
    model3dModels: ModelPrice[];
    textModels: ModelPrice[];
    decisionModels: ModelPrice[];
    audioModels: ModelPrice[];
    realtimeModels: ModelPrice[];
    embeddingModels: ModelPrice[];
    agentModels: ModelPrice[];
    activeTab: SectionType;
};

export const sectionLabels: Record<SectionType, string> = {
    all: "All",
    image: "Image",
    video: "Video",
    "3d": "3D",
    audio: "Audio",
    realtime: "Realtime",
    text: "Text",
    decision: "Decision",
    embedding: "Embedding",
    agent: "Agents",
    mcp: "MCPs",
    sandbox: "Sandboxes",
};

// --- Tab content ---

const INITIAL_MODEL_COUNT = 24;
const MODEL_BATCH_SIZE = 24;

const TabContent: FC<{
    models: ModelPrice[];
    resetKey: string;
}> = ({ models, resetKey }) => {
    const [pagination, setPagination] = useState({
        key: resetKey,
        count: INITIAL_MODEL_COUNT,
    });
    const loadMoreRef = useRef<HTMLDivElement>(null);
    if (pagination.key !== resetKey) {
        setPagination({ key: resetKey, count: INITIAL_MODEL_COUNT });
    }
    const visibleCount =
        pagination.key === resetKey ? pagination.count : INITIAL_MODEL_COUNT;
    const visibleModels = models.slice(0, visibleCount);

    useEffect(() => {
        const loadMore = loadMoreRef.current;
        if (!loadMore) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setPagination((current) => ({
                    key: resetKey,
                    count: Math.min(
                        (current.key === resetKey
                            ? current.count
                            : INITIAL_MODEL_COUNT) + MODEL_BATCH_SIZE,
                        models.length,
                    ),
                }));
            },
            { rootMargin: "600px" },
        );
        observer.observe(loadMore);
        return () => observer.disconnect();
    }, [models.length, resetKey]);

    return (
        <>
            {/* One card at every width: the shared catalog card folds by
                container size, so phones need no card of their own. */}
            <div className="@container flex flex-col gap-3 [--catalog-price-width:21rem]">
                {visibleModels.map((model) => (
                    <ModelRow key={model.name} model={model} />
                ))}
            </div>
            {visibleCount < models.length && (
                <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
            )}
        </>
    );
};

// --- Main export ---

export const UnifiedModelTable: FC<UnifiedModelTableProps> = ({
    listKey,
    allModels,
    imageModels,
    videoModels,
    model3dModels,
    textModels,
    decisionModels,
    audioModels,
    realtimeModels,
    embeddingModels,
    agentModels,
    activeTab,
}) => {
    const sections: { type: SectionType; models: ModelPrice[] }[] = [
        { type: "all", models: allModels },
        { type: "image", models: imageModels },
        { type: "video", models: videoModels },
        { type: "3d", models: model3dModels },
        { type: "audio", models: audioModels },
        { type: "realtime", models: realtimeModels },
        { type: "text", models: textModels },
        { type: "decision", models: decisionModels },
        { type: "embedding", models: embeddingModels },
        { type: "agent", models: agentModels },
    ];

    const activeSection = sections.find((s) => s.type === activeTab);

    return (
        <div>
            {/* Tab content — the selected modality */}
            {activeSection && (
                <TabContent models={activeSection.models} resetKey={listKey} />
            )}
        </div>
    );
};
