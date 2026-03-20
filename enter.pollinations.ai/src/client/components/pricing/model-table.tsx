import { type FC, useState } from "react";
import { cn } from "../../../util.ts";
import { Button } from "../button.tsx";
import { Badge } from "../ui/badge.tsx";

import { calculatePerPollen } from "./calculations.ts";
import {
    getModelDisplayName,
    hasAudioInput,
    hasAudioOutput,
    hasCodeExecution,
    hasReasoning,
    hasSearch,
    hasVision,
    isAlpha,
    isNewModel,
    isPaidOnly,
    isPersona,
} from "./model-info.ts";
import { ModelRow } from "./model-row.tsx";
import { PriceBadge } from "./price-badge.tsx";
import { Tooltip } from "./Tooltip.tsx";
import type { ModelPrice } from "./types.ts";

type UnifiedModelTableProps = {
    imageModels: ModelPrice[];
    videoModels: ModelPrice[];
    textModels: ModelPrice[];
    audioModels: ModelPrice[];
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

const sortModels = (models: ModelPrice[]) => {
    return [...models].sort((a, b) => {
        const aPerPollen = calculatePerPollen(a);
        const bPerPollen = calculatePerPollen(b);
        return (
            getPerPollenNumeric(bPerPollen) - getPerPollenNumeric(aPerPollen)
        );
    });
};

const unitLabels: Record<string, string> = {
    text: "responses",
    image: "images",
    video: "videos",
    audio: "responses",
};

const sectionLabels: Record<string, string> = {
    image: "Image",
    video: "Video",
    audio: "Audio",
    text: "Text",
};

// --- Badge type for mobile price groups ---

type PriceBadgeEntry = {
    price: string | undefined;
    emoji: string;
    perToken?: boolean;
    perImage?: boolean;
    perSecond?: boolean;
    perKChar?: boolean;
};

// --- Tab content ---

type TabContentProps = {
    type: "text" | "image" | "video" | "audio";
    models: ModelPrice[];
    packBalance?: number;
};

const TabContent: FC<TabContentProps> = ({ type, models, packBalance }) => {
    const sorted = sortModels(models);
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
    packBalance?: number;
};

const MobileModelRow: FC<MobileModelRowProps> = ({ model, packBalance }) => {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const displayName = getModelDisplayName(model.name);
    const perPollen = calculatePerPollen(model);
    const showNew = isNewModel(model.name);
    const showPaidOnly = isPaidOnly(model.name);
    const showAlpha = isAlpha(model.name);
    const isDisabled =
        showPaidOnly && packBalance !== undefined && packBalance <= 0;
    const capabilities = [
        hasVision(model.name) && "👁️",
        hasAudioInput(model.name) && "🎙️",
        hasAudioOutput(model.name) && "🔊",
        hasReasoning(model.name) && "🧠",
        hasSearch(model.name) && "🔍",
        hasCodeExecution(model.name) && "💻",
    ].filter(Boolean) as string[];

    const copyModelName = async () => {
        await navigator.clipboard.writeText(model.name);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
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
            <button
                type="button"
                className="w-full text-left p-4 cursor-pointer flex items-start justify-between gap-2"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <svg
                        className={cn(
                            "w-3.5 h-3.5 text-gray-300 transition-transform duration-200 shrink-0",
                            expanded && "rotate-180",
                        )}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                    >
                        <title>Expand model details</title>
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                    {isDisabled ? (
                        <Tooltip content="Top up your pollen balance to unlock this model.">
                            <span className="text-sm font-medium opacity-75">
                                {displayName || model.name}
                            </span>
                        </Tooltip>
                    ) : (
                        <span
                            className={cn(
                                "text-sm",
                                showNew ? "font-bold" : "font-medium",
                            )}
                        >
                            {displayName || model.name}
                        </span>
                    )}
                    {(showNew || showAlpha || showPaidOnly) && (
                        <span
                            className={cn(
                                "flex items-center gap-1.5 basis-full min-[500px]:basis-auto",
                                isDisabled && "opacity-50",
                            )}
                        >
                            {showNew && (
                                <Badge color="green" size="sm">
                                    NEW
                                </Badge>
                            )}
                            {showAlpha && (
                                <Badge color="amber" size="sm">
                                    ALPHA
                                </Badge>
                            )}
                            {showPaidOnly && (
                                <Badge color="purple" size="sm">
                                    PAID
                                </Badge>
                            )}
                        </span>
                    )}
                </div>
                <span
                    className={cn(
                        "text-sm font-medium bg-teal-200 text-gray-900 px-2.5 py-0.5 rounded-full shrink-0",
                        isDisabled && "opacity-50",
                    )}
                >
                    {perPollen}
                </span>
            </button>

            {/* Expanded: model ID + capabilities + full pricing */}
            {expanded && (
                <div
                    className={cn(
                        "px-4 pb-4 pt-0 space-y-2",
                        isDisabled && "opacity-50",
                    )}
                >
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="text-xs text-gray-500 font-mono hover:text-gray-700 cursor-pointer"
                            onClick={copyModelName}
                        >
                            {copied ? "✓ copied" : model.name}
                        </button>
                        {capabilities.length > 0 &&
                            capabilities.map((emoji) => (
                                <span key={emoji} className="text-sm">
                                    {emoji}
                                </span>
                            ))}
                    </div>

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
    const badges: PriceBadgeEntry[] =
        direction === "input"
            ? [
                  {
                      price: model.promptTextPrice,
                      emoji: "💬",
                      perToken: model.perToken,
                  },
                  {
                      price: model.promptCachedPrice,
                      emoji: "💾",
                      perToken: model.perToken,
                  },
                  {
                      price: model.promptAudioPrice,
                      emoji: "🔊",
                      perToken: model.perToken,
                  },
                  {
                      price: model.promptImagePrice,
                      emoji: "🖼️",
                      perToken: model.perToken,
                  },
              ]
            : [
                  {
                      price: model.completionTextPrice,
                      emoji: "💬",
                      perToken: model.perToken,
                  },
                  {
                      price: model.completionAudioPrice,
                      emoji: "🔊",
                      perToken: model.perToken,
                  },
                  { price: model.perCharPrice, emoji: "🔊", perKChar: true },
                  {
                      price: model.perSecondPrice,
                      emoji: model.type === "audio" ? "🔊" : "🎬",
                      perSecond: true,
                  },
                  {
                      price: model.perAudioSecondPrice,
                      emoji: "🔊",
                      perSecond: true,
                  },
                  {
                      price: model.perTokenPrice,
                      emoji: "🎬",
                      perToken: true,
                  },
                  {
                      price: model.perImagePrice,
                      emoji: "🖼️",
                      perImage: true,
                  },
                  {
                      price: model.completionImagePrice,
                      emoji: "🖼️",
                      perToken: model.perToken,
                  },
              ];

    const validBadges = badges.filter((b) => b.price && b.price !== "—");
    if (validBadges.length === 0) return null;

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide shrink-0 w-7">
                {label}
            </span>
            <div className="flex flex-wrap gap-1.5">
                {validBadges.map((b, i) => (
                    <PriceBadge
                        key={`${b.emoji}-${b.price}-${i}`}
                        prices={[b.price]}
                        emoji={b.emoji}
                        subEmojis={[b.emoji]}
                        perToken={b.perToken}
                        perImage={b.perImage}
                        perSecond={b.perSecond}
                        perKChar={b.perKChar}
                    />
                ))}
            </div>
        </div>
    );
};

// --- Main export ---

type SectionType = "image" | "video" | "audio" | "text";

export const UnifiedModelTable: FC<UnifiedModelTableProps> = ({
    imageModels,
    videoModels,
    textModels,
    audioModels,
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

    const [activeTab, setActiveTab] = useState<SectionType>("image");
    const activeSection = sections.find((s) => s.type === activeTab);

    const tabButtons = sections.map((section) => (
        <Button
            key={section.type}
            color="teal"
            weight="light"
            size="small"
            className={cn(
                "px-3",
                activeTab !== section.type && "!bg-white/80 text-gray-500",
            )}
            onClick={() => setActiveTab(section.type)}
        >
            <span className="font-bold">{sectionLabels[section.type]}</span>
        </Button>
    ));

    return (
        <div>
            {/* Tabs + column headers - single responsive row */}
            <div className="flex items-center py-2 pr-4 md:pr-8 gap-y-2">
                <div className="grid grid-cols-2 min-[500px]:flex gap-1.5 min-w-0 shrink-0">
                    {tabButtons}
                </div>
                <div className="flex-1 min-w-6" />
                <Tooltip content="Based on average community usage. Actual costs vary with modality and output.">
                    <div className="cursor-help text-right min-[500px]:text-center shrink-0">
                        <div className="text-sm font-bold text-gray-900">
                            1 pollen ≈
                        </div>
                        <div className="text-xs font-normal text-gray-700 opacity-70 italic">
                            {activeSection
                                ? unitLabels[activeSection.type]
                                : ""}
                        </div>
                    </div>
                </Tooltip>
                <div className="hidden md:block text-center w-[100px] pl-7 shrink-0">
                    <div className="text-sm font-bold text-gray-900">Input</div>
                    <div className="text-xs font-normal text-gray-700 opacity-70 italic">
                        pollen
                    </div>
                </div>
                <div className="hidden md:block text-center w-[100px] pl-7 shrink-0">
                    <div className="text-sm font-bold text-gray-900">
                        Output
                    </div>
                    <div className="text-xs font-normal text-gray-700 opacity-70 italic">
                        pollen
                    </div>
                </div>
            </div>

            {/* Tab content */}
            {activeSection && (
                <TabContent
                    type={activeSection.type}
                    models={activeSection.models}
                    packBalance={packBalance}
                />
            )}
        </div>
    );
};
