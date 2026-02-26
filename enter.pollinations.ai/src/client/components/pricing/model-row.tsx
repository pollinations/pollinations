import { type FC, useState } from "react";
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
} from "./model-info.ts";
import { PriceBadge } from "./price-badge.tsx";
import { Tooltip } from "./Tooltip.tsx";
import type { ModelPrice } from "./types.ts";

type ModelRowProps = {
    model: ModelPrice;
    isLast?: boolean;
    packBalance?: number;
};

export const ModelRow: FC<ModelRowProps> = ({
    model,
    isLast = false,
    packBalance = 0,
}) => {
    const modelDisplayName = getModelDisplayName(model.name);
    const genPerPollen = calculatePerPollen(model);
    const [copied, setCopied] = useState(false);

    const copyModelName = async () => {
        await navigator.clipboard.writeText(model.name);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // Get model capabilities
    const showReasoning = hasReasoning(model.name);
    const showVision = hasVision(model.name);
    const showAudioInput = hasAudioInput(model.name);
    const showAudioOutput = hasAudioOutput(model.name);
    const showSearch = hasSearch(model.name);
    const showCodeExecution = hasCodeExecution(model.name);
    const showNew = isNewModel(model.name);
    const showPaidOnly = isPaidOnly(model.name);
    const showAlpha = isAlpha(model.name);
    const isDisabled = showPaidOnly && packBalance <= 0;

    const borderClass = isLast ? "" : "border-b border-gray-200";
    const priceColor = showPaidOnly ? "purple" : ("teal" as const);

    return (
        <tr>
            <td
                className={`py-2 px-2 text-sm text-gray-700 relative group ${borderClass}`}
            >
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-4 whitespace-nowrap">
                        <span
                            className={`${showNew ? "font-bold" : "font-medium"} ${isDisabled ? "opacity-50" : ""}`}
                        >
                            {modelDisplayName || model.name}
                        </span>
                        {showNew && (
                            <Badge
                                color="green"
                                size="sm"
                                className="font-semibold shadow-[0_0_6px_rgba(34,197,94,0.5)] animate-[glow_2s_ease-in-out_infinite]"
                            >
                                NEW
                            </Badge>
                        )}
                        {showAlpha && (
                            <Tooltip content="Alpha model — experimental, may be unstable">
                                <span className="text-[10px] text-amber-700 bg-transparent px-1.5 py-0.5 rounded-full font-semibold border border-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)] whitespace-nowrap">
                                    ⚠️ ALPHA
                                </span>
                            </Tooltip>
                        )}
                        {showPaidOnly && (
                            <Tooltip
                                content={
                                    isDisabled
                                        ? "Top up your 💎 pollen balance to unlock this model."
                                        : "This model uses your purchased pollen 💎 only."
                                }
                            >
                                <span className="text-[10px] text-purple-700 bg-transparent px-1.5 py-0.5 rounded-full font-semibold border border-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.5)] animate-[glow-purple_2s_ease-in-out_infinite] whitespace-nowrap">
                                    💎 PAID ONLY
                                </span>
                            </Tooltip>
                        )}
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                        <button
                            type="button"
                            onClick={copyModelName}
                            className={`text-xs text-gray-500 font-mono hover:text-gray-700 cursor-pointer text-left ${isDisabled ? "opacity-50" : ""}`}
                            title="Click to copy"
                        >
                            {copied ? "✓ copied" : model.name}
                        </button>
                        {showVision && (
                            <Tooltip
                                content={
                                    model.type === "image"
                                        ? "Vision (image-to-image)"
                                        : "Vision input"
                                }
                            >
                                <span className="text-base">👁️</span>
                            </Tooltip>
                        )}
                        {showAudioInput && (
                            <Tooltip content="Audio input">
                                <span className="text-base">🎙️</span>
                            </Tooltip>
                        )}
                        {showAudioOutput && (
                            <Tooltip content="Audio output">
                                <span className="text-base">🔊</span>
                            </Tooltip>
                        )}
                        {showReasoning && (
                            <Tooltip content="Reasoning">
                                <span className="text-base">🧠</span>
                            </Tooltip>
                        )}
                        {showSearch && (
                            <Tooltip content="Web search">
                                <span className="text-base">🔍</span>
                            </Tooltip>
                        )}
                        {showCodeExecution && (
                            <Tooltip content="Code execution">
                                <span className="text-base">💻</span>
                            </Tooltip>
                        )}
                    </div>
                </div>
            </td>
            <td className={`py-2 px-2 text-sm ${borderClass}`}>
                <div className="flex justify-center">
                    <Badge
                        color={showPaidOnly ? "purple" : "teal"}
                        className={model.type === "image" ? "uppercase" : ""}
                    >
                        {genPerPollen}
                    </Badge>
                </div>
            </td>
            <td className={`py-2 px-2 text-sm text-center ${borderClass}`}>
                <div className="flex flex-col gap-1 items-center">
                    <PriceBadge
                        prices={[model.promptTextPrice]}
                        emoji="💬"
                        subEmojis={["💬"]}
                        perToken={model.perToken}
                        color={priceColor}
                    />
                    <PriceBadge
                        prices={[model.promptCachedPrice]}
                        emoji="💾"
                        subEmojis={["💾"]}
                        perToken={model.perToken}
                        color={priceColor}
                    />
                    <PriceBadge
                        prices={[model.promptAudioPrice]}
                        emoji="🔊"
                        subEmojis={["🔊"]}
                        perToken={model.perToken}
                        color={priceColor}
                    />
                    <PriceBadge
                        prices={[model.promptImagePrice]}
                        emoji="🖼️"
                        subEmojis={["🖼️"]}
                        perToken={model.perToken}
                        color={priceColor}
                    />
                </div>
            </td>
            <td className={`py-2 px-2 text-sm text-center ${borderClass}`}>
                <div className="flex flex-col gap-1 items-center">
                    <PriceBadge
                        prices={[model.completionTextPrice]}
                        emoji="💬"
                        subEmojis={["💬"]}
                        perToken={model.perToken}
                        color={priceColor}
                    />
                    <PriceBadge
                        prices={[model.completionAudioPrice]}
                        emoji="🔊"
                        subEmojis={["🔊"]}
                        perToken={model.perToken}
                        color={priceColor}
                    />
                    <PriceBadge
                        prices={[model.perCharPrice]}
                        emoji="🔊"
                        subEmojis={["🔊"]}
                        perKChar
                        color={priceColor}
                    />
                    <PriceBadge
                        prices={[model.perSecondPrice]}
                        emoji={model.type === "audio" ? "🔊" : "🎬"}
                        subEmojis={model.type === "audio" ? ["🔊"] : ["🎬"]}
                        perSecond
                        color={priceColor}
                    />
                    <PriceBadge
                        prices={[model.perAudioSecondPrice]}
                        emoji="🔊"
                        subEmojis={["🔊"]}
                        perSecond
                        color={priceColor}
                    />
                    <PriceBadge
                        prices={[model.perTokenPrice]}
                        emoji="🎬"
                        subEmojis={["🎬"]}
                        perToken
                        color={priceColor}
                    />
                    <PriceBadge
                        prices={[model.perImagePrice]}
                        emoji="🖼️"
                        subEmojis={["🖼️"]}
                        perImage
                        color={priceColor}
                    />
                    <PriceBadge
                        prices={[model.completionImagePrice]}
                        emoji="🖼️"
                        subEmojis={["🖼️"]}
                        perToken={model.perToken}
                        color={priceColor}
                    />
                </div>
            </td>
        </tr>
    );
};
