import { ChevronIcon, CopyButton, cn } from "@pollinations/ui";
import { type FC, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
    AgentBasePricingLabel,
    AgentPricingNote,
} from "./agent-model-metadata.tsx";
import { CAPABILITY_ICON, MODALITY_ICON } from "./model-icons.tsx";
import {
    type DisplayCapability,
    getModelBrandLogoPath,
    getModelCapabilities,
    getModelDescriptionWithoutName,
    getModelDisplayName,
    getModelInputModalities,
    type InputModality,
    isAlpha,
    isNewModel,
    isPaidOnly,
} from "./model-info.ts";
import { ModelId, ModelRow, PerPollenEstimate } from "./model-row.tsx";
import type { ModelCategory } from "./model-search.ts";
import {
    type BalanceAccess,
    BalanceAccessChip,
    ModelStatusChips,
} from "./model-status-chips.tsx";
import {
    ModelPricingControls,
    ModelPricingLedger,
    useModelPricingSelection,
} from "./price-badge.tsx";
import type { ModelPrice } from "./types.ts";

export type SectionType = ModelCategory;

type UnifiedModelTableProps = {
    listKey: string;
    allModels: ModelPrice[];
    imageModels: ModelPrice[];
    videoModels: ModelPrice[];
    model3dModels: ModelPrice[];
    textModels: ModelPrice[];
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
    embedding: "Embedding",
    agent: "Agents",
};

// --- Tab content ---

// Matches Tailwind's @2xl container breakpoint while respecting the user's
// root font size instead of assuming 1rem is always 16px.
const DESKTOP_TABLE_MIN_REM = 42;
const INITIAL_MODEL_COUNT = 24;
const MODEL_BATCH_SIZE = 24;

function useDesktopModelTable() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const pointerQuery = window.matchMedia("(pointer: fine)");
        const updateLayout = () => {
            const rootFontSize = Number.parseFloat(
                window.getComputedStyle(document.documentElement).fontSize,
            );
            setIsDesktop(
                pointerQuery.matches &&
                    container.clientWidth >=
                        DESKTOP_TABLE_MIN_REM * rootFontSize,
            );
        };
        const observer = new ResizeObserver(updateLayout);

        updateLayout();
        observer.observe(container);
        pointerQuery.addEventListener("change", updateLayout);

        return () => {
            observer.disconnect();
            pointerQuery.removeEventListener("change", updateLayout);
        };
    }, []);

    return { containerRef, isDesktop };
}

const TabContent: FC<{
    models: ModelPrice[];
    isDesktop: boolean;
    resetKey: string;
}> = ({ models, isDesktop, resetKey }) => {
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
    const Row = isDesktop ? ModelRow : MobileModelRow;

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
            <div className={isDesktop ? "flex flex-col gap-2 pb-1" : "pb-1"}>
                {visibleModels.map((model) => (
                    <Row key={model.name} model={model} />
                ))}
            </div>
            {visibleCount < models.length && (
                <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
            )}
        </>
    );
};

// --- Mobile tap-to-expand row ---

type MobileModelRowProps = {
    model: ModelPrice;
};

const MobileModelRow: FC<MobileModelRowProps> = ({ model }) => {
    const [expanded, setExpanded] = useState(false);
    const displayName = getModelDisplayName(model);
    const modelDescription = getModelDescriptionWithoutName(model);
    const brandLogoPath = getModelBrandLogoPath(model);
    const inputModalities = getModelInputModalities(model);
    const capabilities = getModelCapabilities(model);
    const publicModelName = displayName || model.name;
    const showNew = isNewModel(model);
    const showPaidOnly = isPaidOnly(model);
    const showAlpha = isAlpha(model);
    const balanceAccess: BalanceAccess = showPaidOnly ? "paid" : "quest";
    const pricing = useModelPricingSelection(model);

    return (
        <div className="rounded-xl mb-1 bg-surface-opaque shadow-sm transition-colors hover:bg-surface-opaque/90">
            {/* Clickable header */}
            <div className="relative">
                <button
                    type="button"
                    aria-label={
                        expanded
                            ? "Collapse model details"
                            : "Expand model details"
                    }
                    className="absolute inset-0 w-full rounded-xl cursor-pointer"
                    onClick={() => setExpanded(!expanded)}
                />
                <div className="relative z-10 pointer-events-none flex items-center gap-2.5 p-4">
                    {brandLogoPath && (
                        <span
                            aria-hidden="true"
                            className="h-8 w-8 shrink-0 bg-current opacity-55"
                            style={{
                                maskImage: `url(${brandLogoPath})`,
                                WebkitMaskImage: `url(${brandLogoPath})`,
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                                maskPosition: "center",
                                WebkitMaskPosition: "center",
                                maskSize: "contain",
                                WebkitMaskSize: "contain",
                            }}
                        />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex min-w-0 items-center">
                            <CopyButton
                                value={model.name}
                                tooltip={null}
                                aria-label={`Copy model id ${model.name}`}
                                className={(copied) =>
                                    cn(
                                        "pointer-events-auto flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-sm font-medium leading-none transition-colors",
                                        copied
                                            ? "text-intent-success-text"
                                            : "hover:text-theme-text-soft",
                                    )
                                }
                            >
                                <span className="min-w-0 truncate">
                                    {publicModelName}
                                </span>
                            </CopyButton>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                            <MobileMetadataBadges
                                inputModalities={inputModalities}
                                capabilities={capabilities}
                            />
                            <ModelStatusChips
                                showNew={showNew}
                                showAlpha={showAlpha}
                                alphaTooltip={false}
                                perUserRpm={model.perUserRpm}
                            />
                            <BalanceAccessChip
                                access={balanceAccess}
                                className="whitespace-nowrap"
                            />
                        </div>
                        <PerPollenEstimate model={model} inline />
                    </div>
                    <ChevronIcon
                        expanded={expanded}
                        className="h-3.5 w-3.5 shrink-0 text-theme-text-muted"
                    />
                </div>
            </div>

            {/* Expanded: description + full pricing */}
            {expanded && (
                <div className="px-4 pb-4 pt-0">
                    <div
                        className={cn(
                            "flex min-w-0 flex-col gap-2",
                            brandLogoPath ? "pl-[42px]" : "pl-0",
                        )}
                    >
                        <div className="flex min-w-0 flex-col items-start gap-1.5">
                            <div className="min-w-0 w-fit max-w-full rounded-lg bg-theme-bg-subtle px-3 py-2">
                                <ModelId name={model.name} />
                            </div>
                            {model.brandUrl && model.brand && (
                                <a
                                    href={model.brandUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="truncate text-xs text-theme-text-muted underline decoration-current/40 underline-offset-2 hover:text-theme-text-soft"
                                >
                                    {model.brand}
                                </a>
                            )}
                        </div>
                        {modelDescription && (
                            <p className="mb-2 text-sm leading-relaxed text-theme-text-muted">
                                {modelDescription}
                            </p>
                        )}
                        <AgentBasePricingLabel model={model} />
                        <ModelPricingControls model={model} pricing={pricing} />
                        <ModelPricingLedger
                            pricing={pricing}
                            className="w-full"
                        />
                        <AgentPricingNote model={model} />
                    </div>
                </div>
            )}
        </div>
    );
};

type MobileMetadataBadgesProps = {
    inputModalities: InputModality[];
    capabilities: DisplayCapability[];
};

const MobileMetadataBadges: FC<MobileMetadataBadgesProps> = ({
    inputModalities,
    capabilities,
}) => {
    if (inputModalities.length === 0 && capabilities.length === 0) {
        return null;
    }

    return (
        <div className="inline-flex items-center gap-1.5 text-theme-text-muted">
            {inputModalities.length > 0 && (
                <span className="inline-flex items-center gap-1">
                    {inputModalities.map((key) => {
                        const Icon = MODALITY_ICON[key];
                        return <Icon key={key} className="h-4 w-4" />;
                    })}
                </span>
            )}
            {inputModalities.length > 0 && capabilities.length > 0 && (
                <span className="h-3.5 w-px bg-current opacity-30" />
            )}
            {capabilities.length > 0 && (
                <span className="inline-flex items-center gap-1 text-theme-text-soft">
                    {capabilities.map((key) => {
                        const Icon = CAPABILITY_ICON[key];
                        return <Icon key={key} className="h-4 w-4" />;
                    })}
                </span>
            )}
        </div>
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
    audioModels,
    realtimeModels,
    embeddingModels,
    agentModels,
    activeTab,
}) => {
    const { containerRef, isDesktop } = useDesktopModelTable();
    const sections: { type: SectionType; models: ModelPrice[] }[] = [
        { type: "all", models: allModels },
        { type: "image", models: imageModels },
        { type: "video", models: videoModels },
        { type: "3d", models: model3dModels },
        { type: "audio", models: audioModels },
        { type: "realtime", models: realtimeModels },
        { type: "text", models: textModels },
        { type: "embedding", models: embeddingModels },
        { type: "agent", models: agentModels },
    ];

    const activeSection = sections.find((s) => s.type === activeTab);

    return (
        <div ref={containerRef}>
            {activeTab === "agent" && (
                <div className="mb-2 flex items-baseline gap-2 rounded-xl border border-divider bg-theme-bg-subtle px-3 py-2 text-xs leading-snug text-theme-text-muted">
                    <span className="shrink-0 font-medium uppercase tracking-wide text-theme-text-soft">
                        Agent pricing
                    </span>
                    <span>
                        Rates apply to each base-model call. Agents can make
                        multiple calls; Pollinations tool calls use the selected
                        model&apos;s listed price.
                    </span>
                </div>
            )}
            {/* Tab content — the selected modality */}
            {activeSection && isDesktop !== null && (
                <TabContent
                    models={activeSection.models}
                    isDesktop={isDesktop}
                    resetKey={listKey}
                />
            )}
        </div>
    );
};
