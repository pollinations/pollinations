import {
    CardIcon,
    ChevronIcon,
    CopyButton,
    cn,
    InfoTip,
    SproutIcon,
    Tooltip,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import { type FC, useState } from "react";
import { calculatePerPollen, unitLabels } from "./calculations.ts";
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
import { ModelRow } from "./model-row.tsx";
import { ModelStatusChips } from "./model-status-chips.tsx";
import {
    groupPriceBadges,
    PriceBadge,
    type PriceBadgeConfig,
} from "./price-badge.tsx";
import type { ModelPrice } from "./types.ts";

export type SectionType =
    | "image"
    | "video"
    | "audio"
    | "realtime"
    | "text"
    | "embedding";

type UnifiedModelTableProps = {
    imageModels: ModelPrice[];
    videoModels: ModelPrice[];
    textModels: ModelPrice[];
    audioModels: ModelPrice[];
    realtimeModels: ModelPrice[];
    embeddingModels: ModelPrice[];
    activeTab: SectionType;
};

// Helper to convert per pollen string to numeric value for sorting
const getPerPollenNumeric = (perPollen: string): number => {
    if (perPollen === "—") return -1;
    const cleaned = perPollen.replace(" min", "");
    if (cleaned.endsWith("K")) return parseFloat(cleaned) * 1000;
    if (cleaned.endsWith("M")) return parseFloat(cleaned) * 1000000;
    return parseFloat(cleaned) || -1;
};

const sortModels = (models: ModelPrice[]) => {
    return [...models].sort((a, b) => {
        const av = getPerPollenNumeric(calculatePerPollen(a));
        const bv = getPerPollenNumeric(calculatePerPollen(b));
        // Missing values always sort last regardless of direction
        if (av < 0 && bv >= 0) return 1;
        if (bv < 0 && av >= 0) return -1;
        return bv - av;
    });
};

export const sectionLabels: Record<SectionType, string> = {
    image: "Image",
    video: "Video",
    audio: "Audio",
    realtime: "Realtime",
    text: "Text",
    embedding: "Embedding",
};

// --- Tab content ---

type TabContentProps = {
    models: ModelPrice[];
};

const TabContent: FC<TabContentProps> = ({ models }) => {
    const sorted = sortModels(models);

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
                                {(copied) => (
                                    <>
                                        <span className="min-w-0 truncate">
                                            {publicModelName}
                                        </span>
                                        {copied && (
                                            <span className="shrink-0 rounded-lg bg-intent-success-bg-light px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide text-intent-success-text">
                                                copied
                                            </span>
                                        )}
                                    </>
                                )}
                            </CopyButton>
                            {modelDescription && (
                                <span className="pointer-events-auto inline-flex">
                                    <InfoTip
                                        content={modelDescription}
                                        label={`About ${publicModelName}`}
                                    />
                                </span>
                            )}
                            <ModelStatusChips
                                showNew={showNew}
                                showAlpha={showAlpha}
                                alphaTooltip={false}
                            />
                        </div>
                        {(inputModalities.length > 0 ||
                            capabilities.length > 0) && (
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <MobileMetadataBadges
                                    inputModalities={inputModalities}
                                    capabilities={capabilities}
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

            {/* Expanded: capabilities + full pricing */}
            {expanded && (
                <div className="px-4 pb-4 pt-0">
                    <div className="flex min-w-0 flex-col gap-2 pl-6">
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
    direction: "input" | "output";
};

const MobilePriceGroup: FC<MobilePriceGroupProps> = ({
    label,
    model,
    direction,
}) => {
    const badges: PriceBadgeConfig[] = groupPriceBadges(
        direction === "input"
            ? [
                  {
                      prices: [model.promptTextPrice],
                      kind: "text",
                      subKinds: ["text"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.promptCachedPrice],
                      kind: "cached",
                      subKinds: ["cached"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.promptAudioPrice],
                      kind: "audioIn",
                      subKinds: ["audioIn"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.promptImagePrice],
                      kind: "image",
                      subKinds: ["image"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.promptVideoPrice],
                      kind: "video",
                      subKinds: ["video"],
                      perToken: model.perToken,
                  },
              ]
            : [
                  {
                      prices: [model.completionTextPrice],
                      kind: "text",
                      subKinds: ["text"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.completionAudioPrice],
                      kind: "audioOut",
                      subKinds: ["audioOut"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.perSecondPrice],
                      kind: model.type === "audio" ? "audioOut" : "video",
                      subKinds: [model.type === "audio" ? "audioOut" : "video"],
                      perSecond: true,
                  },
                  {
                      prices: [model.perAudioSecondPrice],
                      kind: "audioOut",
                      subKinds: ["audioOut"],
                      perSecond: true,
                  },
                  {
                      prices: [model.perTokenPrice],
                      kind: "video",
                      subKinds: ["video"],
                      perToken: true,
                  },
                  {
                      prices: [model.perImagePrice],
                      kind: "image",
                      subKinds: ["image"],
                      perImage: true,
                  },
                  {
                      prices: [model.completionImagePrice],
                      kind: "image",
                      subKinds: ["image"],
                      perToken: model.perToken,
                  },
              ],
    );

    if (badges.length === 0) return null;

    return (
        <div className="grid w-full grid-cols-[2rem_minmax(0,1fr)] items-center gap-1">
            <span className="text-xs font-bold text-theme-text-muted uppercase tracking-wide">
                {label}
            </span>
            <div className="flex min-w-0 flex-wrap justify-end gap-1">
                {badges.map((badge) => (
                    <PriceBadge
                        key={`${badge.subKinds.join("")}-${badge.prices[0]}-${badge.perToken ? "token" : ""}-${badge.perImage ? "img" : ""}-${badge.perSecond ? "sec" : ""}`}
                        {...badge}
                    />
                ))}
            </div>
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
    audioModels,
    realtimeModels,
    embeddingModels,
    activeTab,
}) => {
    const sections: { type: SectionType; models: ModelPrice[] }[] = [
        { type: "image", models: imageModels },
        { type: "video", models: videoModels },
        ...(audioModels.length > 0
            ? [{ type: "audio" as const, models: audioModels }]
            : []),
        ...(realtimeModels.length > 0
            ? [{ type: "realtime" as const, models: realtimeModels }]
            : []),
        { type: "text", models: textModels },
        ...(embeddingModels.length > 0
            ? [{ type: "embedding" as const, models: embeddingModels }]
            : []),
    ];

    const activeSection = sections.find((s) => s.type === activeTab);

    return (
        <div>
            {/* Column headers */}
            <div className="flex items-center pb-2 pr-4 md:pr-8">
                <div className="flex-1 min-w-6 text-left pl-4">
                    <span className="text-sm font-bold text-ink-900">
                        Model
                    </span>
                </div>
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
                    <div className="text-right min-[500px]:text-center shrink-0 w-[90px] translate-x-[14px]">
                        <div className="text-sm font-bold text-ink-900">
                            1 pollen
                        </div>
                        <div className="text-xs font-normal text-ink-700 opacity-70 italic">
                            ≈{" "}
                            {activeSection
                                ? unitLabels[activeSection.type]
                                : ""}
                        </div>
                    </div>
                </Tooltip>
                <div className="hidden md:block text-center w-[100px] pl-7 shrink-0">
                    <div className="text-sm font-bold text-ink-900">Input</div>
                    <div className="text-xs font-normal text-ink-700 opacity-70 italic">
                        pollen
                    </div>
                </div>
                <div className="hidden md:block text-center w-[100px] pl-7 shrink-0">
                    <div className="text-sm font-bold text-ink-900">Output</div>
                    <div className="text-xs font-normal text-ink-700 opacity-70 italic">
                        pollen
                    </div>
                </div>
            </div>

            {/* Tab content — the selected modality */}
            {activeSection && <TabContent models={activeSection.models} />}
        </div>
    );
};
