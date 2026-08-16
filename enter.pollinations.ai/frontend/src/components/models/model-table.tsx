import { ChevronIcon, Tooltip } from "@pollinations/ui";
import {
    type FC,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import {
    CAPABILITY_ICON,
    getCommunityModelIcon,
    MODALITY_ICON,
} from "./model-icons.tsx";
import {
    type DisplayCapability,
    getModelBrandLogoPath,
    getModelCapabilities,
    getModelCapabilityLabel,
    getModelDisplayName,
    getModelInputModalities,
    getModelModalityLabel,
    type InputModality,
    isAlpha,
    isNewModel,
    isPaidOnly,
} from "./model-info.ts";
import {
    getModelTitleTooltipContent,
    ModelId,
    ModelRow,
    PerPollenEstimate,
} from "./model-row.tsx";
import type { ModelCategory } from "./model-search.ts";
import {
    type BalanceAccess,
    BalanceAccessChip,
    ModelStatusChips,
    PerUserRateLimit,
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
    const detailsId = useId();
    const displayName = getModelDisplayName(model);
    const titleTooltip = getModelTitleTooltipContent(model);
    const brandLogoPath = getModelBrandLogoPath(model);
    const CommunityModelIcon = getCommunityModelIcon(model);
    const hasLeadingIcon = Boolean(brandLogoPath || CommunityModelIcon);
    const inputModalities = getModelInputModalities(model);
    const modalityLabel = getModelModalityLabel(model);
    const capabilities = getModelCapabilities(model);
    const capabilityLabel = getModelCapabilityLabel(model);
    const publicModelName = displayName || model.name;
    const showNew = isNewModel(model);
    const showPaidOnly = isPaidOnly(model);
    const showAlpha = isAlpha(model);
    const balanceAccess: BalanceAccess = model.free
        ? "free"
        : showPaidOnly
          ? "paid"
          : "quest";
    const pricing = useModelPricingSelection(model);
    const toggleDetails = () => setExpanded((current) => !current);

    return (
        <div className="rounded-xl mb-1 bg-surface-opaque shadow-sm transition-colors hover:bg-surface-opaque/90">
            <div className="flex items-center gap-2.5 p-4">
                {CommunityModelIcon ? (
                    <CommunityModelIcon
                        aria-hidden="true"
                        className="h-8 w-8 shrink-0 text-ink-900 opacity-55"
                    />
                ) : (
                    brandLogoPath && (
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
                    )
                )}
                {hasLeadingIcon && (
                    <span
                        aria-hidden="true"
                        className="h-10 w-px shrink-0 bg-divider"
                    />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                        {titleTooltip ? (
                            <Tooltip
                                triggerAs="span"
                                content={titleTooltip}
                                ariaLabel={`${publicModelName}: model details`}
                                className="min-w-0"
                                tapEnabled
                                displayContents
                            >
                                <span className="min-w-0 truncate text-left text-sm font-medium leading-tight">
                                    {publicModelName}
                                </span>
                            </Tooltip>
                        ) : (
                            <span className="min-w-0 truncate text-left text-sm font-medium leading-tight">
                                {publicModelName}
                            </span>
                        )}
                        <ModelStatusChips
                            showNew={showNew}
                            showAlpha={showAlpha}
                        />
                    </div>
                    <ModelId name={model.name} showCopyIcon />
                    {model.brandUrl && model.brand && (
                        <a
                            href={model.brandUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="w-fit max-w-full truncate text-xs text-theme-text-muted underline decoration-current/40 underline-offset-2 hover:text-theme-text-soft"
                        >
                            {model.brand}
                        </a>
                    )}
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <MobileMetadataBadges
                            inputModalities={inputModalities}
                            capabilities={capabilities}
                            modalityLabel={modalityLabel}
                            capabilityLabel={capabilityLabel}
                        />
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <PerPollenEstimate model={model} />
                            <BalanceAccessChip
                                access={balanceAccess}
                                className="whitespace-nowrap"
                            />
                        </div>
                        {model.perUserRpm != null && (
                            <div className="flex min-w-0 items-center">
                                <PerUserRateLimit value={model.perUserRpm} />
                            </div>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    aria-label={
                        expanded
                            ? "Collapse model details"
                            : "Expand model details"
                    }
                    className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-theme-bg-active text-theme-text-muted transition-colors hover:bg-theme-bg-hover hover:text-theme-text-strong"
                    onClick={toggleDetails}
                >
                    <ChevronIcon
                        expanded={expanded}
                        className="h-3.5 w-3.5 shrink-0 text-theme-text-muted"
                    />
                </button>
            </div>

            {/* Expanded: full pricing */}
            {expanded && (
                <div id={detailsId} className="flex gap-2.5 px-4 pb-4 pt-0">
                    {hasLeadingIcon && (
                        <>
                            <span
                                aria-hidden="true"
                                className="hidden w-8 shrink-0 min-[480px]:block"
                            />
                            <span
                                aria-hidden="true"
                                className="hidden w-px shrink-0 min-[480px]:block"
                            />
                        </>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <ModelPricingControls model={model} pricing={pricing} />
                        <ModelPricingLedger
                            pricing={pricing}
                            className="w-full"
                            align="left"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

type MobileMetadataBadgesProps = {
    inputModalities: InputModality[];
    capabilities: DisplayCapability[];
    modalityLabel: string;
    capabilityLabel: string;
};

const MobileMetadataBadges: FC<MobileMetadataBadgesProps> = ({
    inputModalities,
    capabilities,
    modalityLabel,
    capabilityLabel,
}) => {
    if (inputModalities.length === 0 && capabilities.length === 0) {
        return null;
    }

    return (
        <div className="mb-1 inline-flex items-center gap-1.5 text-theme-text-muted">
            {inputModalities.length > 0 && (
                <Tooltip
                    triggerAs="span"
                    content={
                        <span>
                            <strong className="font-semibold text-theme-text-strong">
                                Input:
                            </strong>{" "}
                            {inputModalities.join(", ")}
                        </span>
                    }
                    ariaLabel={modalityLabel}
                    tapEnabled
                    displayContents
                >
                    <span className="inline-flex items-center gap-1">
                        {inputModalities.map((key) => {
                            const Icon = MODALITY_ICON[key];
                            return <Icon key={key} className="h-4 w-4" />;
                        })}
                    </span>
                </Tooltip>
            )}
            {inputModalities.length > 0 && capabilities.length > 0 && (
                <span className="h-3.5 w-px bg-current opacity-30" />
            )}
            {capabilities.length > 0 && (
                <Tooltip
                    triggerAs="span"
                    content={
                        <strong className="font-semibold text-theme-text-strong">
                            {capabilityLabel}
                        </strong>
                    }
                    ariaLabel={capabilityLabel}
                    tapEnabled
                    displayContents
                >
                    <span className="inline-flex items-center gap-1 text-theme-text-soft">
                        {capabilities.map((key) => {
                            const Icon = CAPABILITY_ICON[key];
                            return <Icon key={key} className="h-4 w-4" />;
                        })}
                    </span>
                </Tooltip>
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
