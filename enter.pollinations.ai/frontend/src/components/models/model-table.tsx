import {
    CardIcon,
    ChevronIcon,
    CopyButton,
    cn,
    SproutIcon,
    Tooltip,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import { type FC, useState } from "react";
import {
    calculatePerPollen,
    calculatePerPollenValue,
    unitLabels,
} from "./calculations.ts";
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
import { ModelId, ModelRow } from "./model-row.tsx";
import { ModelStatusChips } from "./model-status-chips.tsx";
import { getModelPriceBadges, PriceBadgeList } from "./price-badge.tsx";
import type { ModelPrice, PriceDirection } from "./types.ts";

export type SectionType =
    | "image"
    | "video"
    | "audio"
    | "realtime"
    | "text"
    | "community"
    | "embedding";

type UnifiedModelTableProps = {
    imageModels: ModelPrice[];
    videoModels: ModelPrice[];
    textModels: ModelPrice[];
    communityModels: ModelPrice[];
    audioModels: ModelPrice[];
    realtimeModels: ModelPrice[];
    embeddingModels: ModelPrice[];
    activeTab: SectionType;
};

type SortKey = "name" | "perPollen" | "input" | "output";
type SortDir = "asc" | "desc";

const DEFAULT_DIR: Record<SortKey, SortDir> = {
    name: "asc",
    perPollen: "desc",
    input: "asc",
    output: "asc",
};

const sortModels = (
    models: ModelPrice[],
    sortKey: SortKey,
    sortDir: SortDir,
) => {
    const sign = sortDir === "asc" ? 1 : -1;
    return [...models].sort((a, b) => {
        if (sortKey === "name") {
            const an = (getModelDisplayName(a) ?? a.name).toLowerCase();
            const bn = (getModelDisplayName(b) ?? b.name).toLowerCase();
            return an < bn ? -sign : an > bn ? sign : 0;
        }
        const av =
            sortKey === "perPollen"
                ? (calculatePerPollenValue(a) ?? -1)
                : sortKey === "input"
                  ? (a.inputSortPrice ?? -1)
                  : (a.outputSortPrice ?? -1);
        const bv =
            sortKey === "perPollen"
                ? (calculatePerPollenValue(b) ?? -1)
                : sortKey === "input"
                  ? (b.inputSortPrice ?? -1)
                  : (b.outputSortPrice ?? -1);
        // Missing values always sort last regardless of direction
        if (av < 0 && bv >= 0) return 1;
        if (bv < 0 && av >= 0) return -1;
        return (av - bv) * sign;
    });
};

export const sectionLabels: Record<SectionType, string> = {
    image: "Image",
    video: "Video",
    audio: "Audio",
    realtime: "Realtime",
    text: "Text",
    community: "Community",
    embedding: "Embedding",
};

// --- Tab content ---

type TabContentProps = {
    models: ModelPrice[];
    sortKey: SortKey;
    sortDir: SortDir;
};

const TabContent: FC<TabContentProps> = ({ models, sortKey, sortDir }) => {
    const sorted = sortModels(models, sortKey, sortDir);

    return (
        <>
            {/* Desktop cards */}
            <div className="hidden md:flex md:flex-col gap-2 pb-1">
                {sorted.map((model) => (
                    <ModelRow key={model.name} model={model} />
                ))}
            </div>

            {/* Mobile list */}
            <div className="md:hidden pb-1">
                {sorted.map((model) => (
                    <MobileModelRow key={model.name} model={model} />
                ))}
            </div>
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

    const perPollen = calculatePerPollen(model);

    return (
        <div className="rounded-xl mb-1 bg-surface-opaque shadow-well transition-colors hover:bg-surface-opaque/90">
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
                    <ChevronIcon
                        expanded={expanded}
                        className="h-3.5 w-3.5 shrink-0 text-theme-text-muted"
                    />
                    {brandLogoPath && (
                        <span
                            aria-hidden="true"
                            className="h-[1.35rem] w-[1.35rem] shrink-0 bg-current opacity-55"
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
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex min-w-0 items-center gap-2">
                            <CopyButton
                                value={model.name}
                                tooltip={`Copy "${model.name}"`}
                                copiedTooltip={null}
                                aria-label={`Copy model id ${model.name}`}
                                className={(copied) =>
                                    cn(
                                        "pointer-events-auto flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-sm font-medium leading-none transition-colors",
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
                        <ModelId name={model.name} />
                        {(inputModalities.length > 0 ||
                            capabilities.length > 0) && (
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <MobileMetadataBadges
                                    inputModalities={inputModalities}
                                    capabilities={capabilities}
                                />
                            </div>
                        )}
                        {(showNew || showAlpha) && (
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <ModelStatusChips
                                    showNew={showNew}
                                    showAlpha={showAlpha}
                                    alphaTooltip={false}
                                />
                            </div>
                        )}
                    </div>
                    {showPaidOnly ? (
                        <PaidChip className="shrink-0">
                            <CardIcon className="h-3.5 w-3.5" />
                            {perPollen}
                        </PaidChip>
                    ) : (
                        <TierChip className="shrink-0">
                            <SproutIcon className="h-3.5 w-3.5" />
                            {perPollen}
                        </TierChip>
                    )}
                </div>
            </div>

            {/* Expanded: description + full pricing */}
            {expanded && (
                <div className="px-4 pb-4 pt-0">
                    <div className="flex min-w-0 flex-col gap-2 pl-6">
                        {modelDescription && (
                            <p className="mb-2 text-sm leading-relaxed text-theme-text-muted">
                                {modelDescription}
                            </p>
                        )}
                        <MobilePriceGroup
                            label="In"
                            model={model}
                            direction="input"
                        />

                        <MobilePriceGroup
                            label="Out"
                            model={model}
                            direction="output"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Mobile price group ---

type MobilePriceGroupProps = {
    label: string;
    model: ModelPrice;
    direction: PriceDirection;
};

const MobilePriceGroup: FC<MobilePriceGroupProps> = ({
    label,
    model,
    direction,
}) => {
    const badges = getModelPriceBadges(model, direction);

    if (badges.length === 0) return null;

    return (
        <div className="grid w-full grid-cols-[2rem_minmax(0,1fr)] items-center gap-1">
            <span className="text-xs font-bold text-theme-text-muted uppercase tracking-wide">
                {label}
            </span>
            <PriceBadgeList
                badges={badges}
                className="flex min-w-0 flex-wrap justify-end gap-1"
            />
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
        <div className="inline-flex items-center gap-2.5 text-theme-text-muted">
            {inputModalities.length > 0 && (
                <span className="inline-flex items-center gap-2">
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
                <span className="inline-flex items-center gap-2 text-theme-text-soft">
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
    imageModels,
    videoModels,
    textModels,
    communityModels,
    audioModels,
    realtimeModels,
    embeddingModels,
    activeTab,
}) => {
    const sections: { type: SectionType; models: ModelPrice[] }[] = [
        { type: "image", models: imageModels },
        { type: "video", models: videoModels },
        { type: "audio", models: audioModels },
        { type: "realtime", models: realtimeModels },
        { type: "text", models: textModels },
        { type: "community", models: communityModels },
        { type: "embedding", models: embeddingModels },
    ];

    const [sortKey, setSortKey] = useState<SortKey>("perPollen");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const activeSection = sections.find((s) => s.type === activeTab);

    const onSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir(DEFAULT_DIR[key]);
        }
    };

    const sortArrow = (key: SortKey) =>
        sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : null;

    return (
        <div>
            {/* Column headers (sortable) */}
            <div className="flex items-center pb-2 pr-4 md:pr-8">
                <button
                    type="button"
                    onClick={() => onSort("name")}
                    className="flex-1 min-w-6 text-left pl-4 cursor-pointer hover:text-theme-text-base"
                >
                    <span className="text-sm font-bold text-ink-900">
                        Model {sortArrow("name")}
                    </span>
                </button>
                <Tooltip
                    triggerAs="span"
                    content={
                        <span className="block w-[220px] whitespace-normal leading-snug">
                            Based on{" "}
                            <span className="font-semibold text-theme-text-strong">
                                average community usage
                            </span>
                            . Actual costs vary with modality and output.
                        </span>
                    }
                >
                    <button
                        type="button"
                        onClick={() => onSort("perPollen")}
                        className="text-right min-[500px]:text-center shrink-0 w-[90px] translate-x-[14px] cursor-pointer hover:text-theme-text-base"
                    >
                        <div className="text-sm font-bold text-ink-900">
                            1 pollen {sortArrow("perPollen")}
                        </div>
                        <div className="text-xs font-normal text-ink-700 opacity-70 italic">
                            ≈{" "}
                            {activeSection
                                ? unitLabels[activeSection.type]
                                : ""}
                        </div>
                    </button>
                </Tooltip>
                <button
                    type="button"
                    onClick={() => onSort("input")}
                    className="hidden md:block text-center w-[100px] pl-7 shrink-0 cursor-pointer hover:text-theme-text-base"
                >
                    <div className="text-sm font-bold text-ink-900">
                        Input {sortArrow("input")}
                    </div>
                    <div className="text-xs font-normal text-ink-700 opacity-70 italic">
                        pollen
                    </div>
                </button>
                <button
                    type="button"
                    onClick={() => onSort("output")}
                    className="hidden md:block text-center w-[100px] pl-7 shrink-0 cursor-pointer hover:text-theme-text-base"
                >
                    <div className="text-sm font-bold text-ink-900">
                        Output {sortArrow("output")}
                    </div>
                    <div className="text-xs font-normal text-ink-700 opacity-70 italic">
                        pollen
                    </div>
                </button>
            </div>

            {/* Tab content — the selected modality */}
            {activeSection && (
                <TabContent
                    models={activeSection.models}
                    sortKey={sortKey}
                    sortDir={sortDir}
                />
            )}
        </div>
    );
};
