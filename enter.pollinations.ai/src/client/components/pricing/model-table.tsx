import {
    getActivePriceDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import { type FC, type MouseEvent, useState } from "react";
import { cn } from "../../../util.ts";
import { Tag } from "../ui/tag.tsx";

import { calculateForBalance, calculatePerPollen } from "./calculations.ts";
import {
    getModelBrandLogoPath,
    getModelCapabilityIcons,
    getModelDisplayName,
    getModelModalityIcons,
    isAlpha,
    isNewModel,
    isPaidOnly,
    isPersona,
} from "./model-info.ts";
import { ModelRow } from "./model-row.tsx";
import {
    groupPriceBadges,
    PriceBadge,
    type PriceBadgeConfig,
} from "./price-badge.tsx";
import { Tooltip } from "./Tooltip.tsx";
import type { ModelPrice } from "./types.ts";

export type SectionType = "image" | "video" | "audio" | "text";

type UnifiedModelTableProps = {
    imageModels: ModelPrice[];
    videoModels: ModelPrice[];
    textModels: ModelPrice[];
    audioModels: ModelPrice[];
    activeTab: SectionType;
    tierBalance?: number;
    packBalance?: number;
};

// Helper to convert per pollen string to numeric value for sorting
const getPerPollenNumeric = (perPollen: string): number => {
    if (perPollen === "—") return -1;
    const cleaned = perPollen.replace(" min", "");
    if (cleaned.endsWith("K")) return parseFloat(cleaned) * 1000;
    if (cleaned.endsWith("M")) return parseFloat(cleaned) * 1000000;
    return parseFloat(cleaned) || -1;
};

type SortKey = "name" | "perPollen" | "input" | "output";
type SortDir = "asc" | "desc";

const DEFAULT_DIR: Record<SortKey, SortDir> = {
    name: "asc",
    perPollen: "desc",
    input: "asc",
    output: "asc",
};

const getInputSortValue = (modelName: string): number => {
    const p = getActivePriceDefinition(modelName as ModelName);
    if (!p) return -1;
    const sum =
        (p.promptTextTokens ?? 0) +
        (p.promptCachedTokens ?? 0) +
        (p.promptAudioTokens ?? 0) +
        (p.promptAudioSeconds ?? 0) +
        (p.promptImageTokens ?? 0);
    return sum > 0 ? sum : -1;
};

const getOutputSortValue = (modelName: string): number => {
    const p = getActivePriceDefinition(modelName as ModelName);
    if (!p) return -1;
    const sum =
        (p.completionTextTokens ?? 0) +
        (p.completionAudioTokens ?? 0) +
        (p.completionAudioSeconds ?? 0) +
        (p.completionImageTokens ?? 0) +
        (p.completionVideoSeconds ?? 0) +
        (p.completionVideoTokens ?? 0);
    return sum > 0 ? sum : -1;
};

const sortModels = (
    models: ModelPrice[],
    sortKey: SortKey,
    sortDir: SortDir,
) => {
    const sign = sortDir === "asc" ? 1 : -1;
    return [...models].sort((a, b) => {
        if (sortKey === "name") {
            const an = (getModelDisplayName(a.name) ?? a.name).toLowerCase();
            const bn = (getModelDisplayName(b.name) ?? b.name).toLowerCase();
            return an < bn ? -sign : an > bn ? sign : 0;
        }
        const av =
            sortKey === "perPollen"
                ? getPerPollenNumeric(calculatePerPollen(a))
                : sortKey === "input"
                  ? getInputSortValue(a.name)
                  : getOutputSortValue(a.name);
        const bv =
            sortKey === "perPollen"
                ? getPerPollenNumeric(calculatePerPollen(b))
                : sortKey === "input"
                  ? getInputSortValue(b.name)
                  : getOutputSortValue(b.name);
        // Missing values always sort last regardless of direction
        if (av < 0 && bv >= 0) return 1;
        if (bv < 0 && av >= 0) return -1;
        return (av - bv) * sign;
    });
};

const unitLabels: Record<string, string> = {
    text: "responses",
    image: "images",
    video: "videos",
    audio: "responses",
};

export const sectionLabels: Record<SectionType, string> = {
    image: "Image",
    video: "Video",
    audio: "Audio",
    text: "Text",
};

// --- Tab content ---

type TabContentProps = {
    type: "text" | "image" | "video" | "audio";
    models: ModelPrice[];
    sortKey: SortKey;
    sortDir: SortDir;
    tierBalance?: number;
    packBalance?: number;
};

const TabContent: FC<TabContentProps> = ({
    type,
    models,
    sortKey,
    sortDir,
    tierBalance,
    packBalance,
}) => {
    const sorted = sortModels(models, sortKey, sortDir);
    const regularModels =
        type === "text" ? sorted.filter((m) => !isPersona(m.name)) : sorted;
    const personaModels =
        type === "text" ? sorted.filter((m) => isPersona(m.name)) : [];

    return (
        <>
            {/* Desktop cards */}
            <div className="hidden md:flex md:flex-col gap-2 pb-1">
                {regularModels.map((model) => (
                    <ModelRow
                        key={model.name}
                        model={model}
                        tierBalance={tierBalance}
                        packBalance={packBalance}
                    />
                ))}
                {personaModels.length > 0 && (
                    <>
                        <div className="pt-2 pb-0 px-2">
                            <span className="text-xs font-semibold text-pink-500 opacity-60">
                                Persona
                            </span>
                        </div>
                        {personaModels.map((model) => (
                            <ModelRow
                                key={model.name}
                                model={model}
                                tierBalance={tierBalance}
                                packBalance={packBalance}
                            />
                        ))}
                    </>
                )}
            </div>

            {/* Mobile list */}
            <div className="md:hidden pb-1">
                {regularModels.map((model) => (
                    <MobileModelRow
                        key={model.name}
                        model={model}
                        tierBalance={tierBalance}
                        packBalance={packBalance}
                    />
                ))}
                {personaModels.length > 0 && (
                    <>
                        <div className="pt-3 pb-1 px-4">
                            <span className="text-xs font-semibold text-pink-500 opacity-60">
                                Persona
                            </span>
                        </div>
                        {personaModels.map((model) => (
                            <MobileModelRow
                                key={model.name}
                                model={model}
                                tierBalance={tierBalance}
                                packBalance={packBalance}
                            />
                        ))}
                    </>
                )}
            </div>
        </>
    );
};

// --- Mobile tap-to-expand row ---

type MobileModelRowProps = {
    model: ModelPrice;
    tierBalance?: number;
    packBalance?: number;
};

const MobileModelRow: FC<MobileModelRowProps> = ({
    model,
    tierBalance,
    packBalance,
}) => {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const displayName = getModelDisplayName(model.name);
    const brandLogoPath = getModelBrandLogoPath(model.name);
    const modalityIcons = getModelModalityIcons(model.name);
    const capabilityIcons = getModelCapabilityIcons(model.name);
    const publicModelName = displayName || model.name;
    const showNew = isNewModel(model.name);
    const showPaidOnly = isPaidOnly(model.name);
    const showAlpha = isAlpha(model.name);

    const isSignedIn = packBalance !== undefined;
    const paidBalance = packBalance ?? 0;
    const totalBalance = (tierBalance ?? 0) + paidBalance;
    const effectiveBalance = showPaidOnly ? paidBalance : totalBalance;

    const perPollen = calculatePerPollen(model);
    const balanceRequests = isSignedIn
        ? calculateForBalance(model, effectiveBalance)
        : null;
    const isDisabled = isSignedIn && balanceRequests === "0";

    const copyModelName = async (e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(model.name);
        setCopied(true);
        setTimeout(() => setCopied(false), 900);
    };

    return (
        <div
            className={cn(
                "rounded-xl mb-1 border",
                expanded ? "border-teal-200" : "border-transparent",
                isDisabled
                    ? "bg-transparent"
                    : expanded
                      ? "bg-white/90"
                      : "bg-white/80 hover:bg-white/90 transition-colors",
            )}
        >
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
                <div className="relative z-10 pointer-events-none grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 p-4">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <svg
                            className={cn(
                                "mt-1 w-3.5 h-3.5 text-gray-300 transition-transform duration-200 shrink-0",
                                expanded && "rotate-180",
                            )}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 9l-7 7-7-7"
                            />
                        </svg>
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2.5">
                                {brandLogoPath && (
                                    <span
                                        aria-hidden="true"
                                        className="h-[1.35rem] w-[1.35rem] shrink-0 self-center bg-current opacity-55"
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
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                    {publicModelName}
                                </span>
                            </div>
                            {(showNew ||
                                showAlpha ||
                                showPaidOnly ||
                                modalityIcons.length > 0 ||
                                capabilityIcons.length > 0) && (
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                                    <MobileMetadataBadges
                                        modalityIcons={modalityIcons}
                                        capabilityIcons={capabilityIcons}
                                    />
                                    {showNew && (
                                        <Tag color="green" size="sm">
                                            NEW
                                        </Tag>
                                    )}
                                    {showAlpha && (
                                        <Tag color="orange" size="sm">
                                            ALPHA
                                        </Tag>
                                    )}
                                    {showPaidOnly && (
                                        <Tag color="purple" size="sm">
                                            PAID
                                        </Tag>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <Tag color="teal" className="justify-self-end">
                        {perPollen}
                    </Tag>
                </div>
            </div>

            {/* Expanded: capabilities + full pricing */}
            {expanded && (
                <div className="px-4 pb-4 pt-0">
                    <div className="flex min-w-0 flex-col gap-2 pl-6">
                        <button
                            type="button"
                            onClick={copyModelName}
                            className={cn(
                                "inline-flex max-w-full cursor-pointer items-center gap-1.5 self-start text-xs font-medium leading-none text-gray-500 transition-colors",
                                copied
                                    ? "text-teal-700"
                                    : "hover:text-gray-700",
                            )}
                            aria-label={`Copy API model name ${model.name}`}
                        >
                            <span className="min-w-0 truncate">
                                {model.name}
                            </span>
                            {copied && (
                                <span className="rounded-md bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                                    copied
                                </span>
                            )}
                        </button>
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
                      emoji: "💬",
                      subEmojis: ["💬"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.promptCachedPrice],
                      emoji: "💾",
                      subEmojis: ["💾"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.promptAudioPrice],
                      emoji: "🎙️",
                      subEmojis: ["🎙️"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.promptImagePrice],
                      emoji: "🖼️",
                      subEmojis: ["🖼️"],
                      perToken: model.perToken,
                  },
              ]
            : [
                  {
                      prices: [model.completionTextPrice],
                      emoji: "💬",
                      subEmojis: ["💬"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.completionAudioPrice],
                      emoji: "🔊",
                      subEmojis: ["🔊"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.perSecondPrice],
                      emoji: model.type === "audio" ? "🔊" : "🎬",
                      subEmojis: [model.type === "audio" ? "🔊" : "🎬"],
                      perSecond: true,
                  },
                  {
                      prices: [model.perAudioSecondPrice],
                      emoji: "🔊",
                      subEmojis: ["🔊"],
                      perSecond: true,
                  },
                  {
                      prices: [model.perTokenPrice],
                      emoji: "🎬",
                      subEmojis: ["🎬"],
                      perToken: true,
                  },
                  {
                      prices: [model.perImagePrice],
                      emoji: "🖼️",
                      subEmojis: ["🖼️"],
                      perImage: true,
                  },
                  {
                      prices: [model.completionImagePrice],
                      emoji: "🖼️",
                      subEmojis: ["🖼️"],
                      perToken: model.perToken,
                  },
              ],
    );

    if (badges.length === 0) return null;

    return (
        <div className="grid w-full grid-cols-[2rem_minmax(0,1fr)] items-center gap-1">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                {label}
            </span>
            <div className="flex min-w-0 flex-wrap justify-end gap-1">
                {badges.map((badge) => (
                    <PriceBadge
                        key={`${badge.subEmojis.join("")}-${badge.prices[0]}-${badge.perToken ? "token" : ""}-${badge.perImage ? "img" : ""}-${badge.perSecond ? "sec" : ""}`}
                        {...badge}
                    />
                ))}
            </div>
        </div>
    );
};

type MobileMetadataBadgesProps = {
    modalityIcons: string[];
    capabilityIcons: string[];
};

const MobileMetadataBadges: FC<MobileMetadataBadgesProps> = ({
    modalityIcons,
    capabilityIcons,
}) => {
    if (modalityIcons.length === 0 && capabilityIcons.length === 0) {
        return null;
    }

    return (
        <>
            {modalityIcons.length > 0 && (
                <Tag
                    color="gray"
                    size="sm"
                    className="border border-gray-400/70 bg-gray-100/80 text-gray-900"
                >
                    {modalityIcons.map((emoji) => (
                        <span key={emoji}>{emoji}</span>
                    ))}
                </Tag>
            )}
            {capabilityIcons.length > 0 && (
                <Tag
                    color="gray"
                    size="sm"
                    className="border border-gray-400/70 bg-gray-100/80 text-gray-900"
                >
                    {capabilityIcons.map((emoji) => (
                        <span key={emoji}>{emoji}</span>
                    ))}
                </Tag>
            )}
        </>
    );
};

// --- Main export ---

export const UnifiedModelTable: FC<UnifiedModelTableProps> = ({
    imageModels,
    videoModels,
    textModels,
    audioModels,
    activeTab,
    tierBalance,
    packBalance,
}) => {
    const sections: { type: SectionType; models: ModelPrice[] }[] = [
        { type: "image", models: imageModels },
        { type: "video", models: videoModels },
        ...(audioModels.length > 0
            ? [{ type: "audio" as const, models: audioModels }]
            : []),
        { type: "text", models: textModels },
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
                    className="flex-1 min-w-6 text-left pl-[52px] cursor-pointer hover:text-gray-700"
                >
                    <span className="text-sm font-bold text-gray-900">
                        Model {sortArrow("name")}
                    </span>
                </button>
                <Tooltip
                    triggerAs="span"
                    content={
                        <span className="block w-[220px] whitespace-normal leading-snug">
                            Based on average community usage. Actual costs vary
                            with modality and output.
                        </span>
                    }
                >
                    <button
                        type="button"
                        onClick={() => onSort("perPollen")}
                        className="text-right min-[500px]:text-center shrink-0 w-[90px] translate-x-[14px] cursor-pointer hover:text-gray-700"
                    >
                        <div className="text-sm font-bold text-gray-900">
                            1 pollen {sortArrow("perPollen")}
                        </div>
                        <div className="text-xs font-normal text-gray-700 opacity-70 italic">
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
                    className="hidden md:block text-center w-[100px] pl-7 shrink-0 cursor-pointer hover:text-gray-700"
                >
                    <div className="text-sm font-bold text-gray-900">
                        Input {sortArrow("input")}
                    </div>
                    <div className="text-xs font-normal text-gray-700 opacity-70 italic">
                        pollen
                    </div>
                </button>
                <button
                    type="button"
                    onClick={() => onSort("output")}
                    className="hidden md:block text-center w-[100px] pl-7 shrink-0 cursor-pointer hover:text-gray-700"
                >
                    <div className="text-sm font-bold text-gray-900">
                        Output {sortArrow("output")}
                    </div>
                    <div className="text-xs font-normal text-gray-700 opacity-70 italic">
                        pollen
                    </div>
                </button>
            </div>

            {/* Tab content */}
            {activeSection && (
                <TabContent
                    type={activeSection.type}
                    models={activeSection.models}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    tierBalance={tierBalance}
                    packBalance={packBalance}
                />
            )}
        </div>
    );
};
