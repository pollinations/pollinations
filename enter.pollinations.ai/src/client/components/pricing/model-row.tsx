import { type FC, useState } from "react";
import { cn } from "../../../util.ts";
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
    packBalance?: number;
};

export const ModelRow: FC<ModelRowProps> = ({ model, packBalance }) => {
    const modelDisplayName = getModelDisplayName(model.name);
    const genPerPollen = calculatePerPollen(model);
    const [copied, setCopied] = useState(false);

    const copyModelName = async () => {
        await navigator.clipboard.writeText(model.name);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const showReasoning = hasReasoning(model.name);
    const showVision = hasVision(model.name);
    const showAudioInput = hasAudioInput(model.name);
    const showAudioOutput = hasAudioOutput(model.name);
    const showSearch = hasSearch(model.name);
    const showCodeExecution = hasCodeExecution(model.name);
    const showNew = isNewModel(model.name);
    const showPaidOnly = isPaidOnly(model.name);
    const showAlpha = isAlpha(model.name);
    const isDisabled =
        showPaidOnly && packBalance !== undefined && packBalance <= 0;

    return (
        <div
            className={cn(
                "flex items-center rounded-xl p-4",
                isDisabled
                    ? "bg-transparent"
                    : "bg-white/80 hover:bg-white/90 transition-colors",
            )}
        >
            {/* Model info — flexible width */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 whitespace-nowrap">
                    {isDisabled ? (
                        <Tooltip content="Top up your pollen balance to unlock this model.">
                            <span
                                className={cn("text-sm font-medium opacity-75")}
                            >
                                {modelDisplayName || model.name}
                            </span>
                        </Tooltip>
                    ) : (
                        <span
                            className={cn(
                                "text-sm",
                                showNew ? "font-bold" : "font-medium",
                            )}
                        >
                            {modelDisplayName || model.name}
                        </span>
                    )}
                    {showNew && (
                        <span className={cn(isDisabled && "opacity-50")}>
                            <Badge color="green" size="sm">
                                NEW
                            </Badge>
                        </span>
                    )}
                    {showAlpha && (
                        <span className={cn(isDisabled && "opacity-50")}>
                            <Tooltip content="Alpha model — experimental, may be unstable">
                                <Badge color="amber" size="sm">
                                    ALPHA
                                </Badge>
                            </Tooltip>
                        </span>
                    )}
                    {showPaidOnly && (
                        <span className={cn(isDisabled && "opacity-50")}>
                            <Tooltip
                                content={
                                    isDisabled
                                        ? "Top up your pollen balance to unlock this model."
                                        : "This model uses purchased pollen only."
                                }
                            >
                                <Badge color="purple" size="sm">
                                    PAID
                                </Badge>
                            </Tooltip>
                        </span>
                    )}
                </div>
                <div
                    className={cn(
                        "flex items-center gap-2 whitespace-nowrap",
                        isDisabled && "opacity-50",
                    )}
                >
                    <button
                        type="button"
                        onClick={copyModelName}
                        className="text-xs text-gray-500 font-mono hover:text-gray-700 cursor-pointer text-left"
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
                            <span className="text-sm">👁️</span>
                        </Tooltip>
                    )}
                    {showAudioInput && (
                        <Tooltip content="Audio input">
                            <span className="text-sm">🎙️</span>
                        </Tooltip>
                    )}
                    {showAudioOutput && (
                        <Tooltip content="Audio output">
                            <span className="text-sm">🔊</span>
                        </Tooltip>
                    )}
                    {showReasoning && (
                        <Tooltip content="Reasoning">
                            <span className="text-sm">🧠</span>
                        </Tooltip>
                    )}
                    {showSearch && (
                        <Tooltip content="Web search">
                            <span className="text-sm">🔍</span>
                        </Tooltip>
                    )}
                    {showCodeExecution && (
                        <Tooltip content="Code execution">
                            <span className="text-sm">💻</span>
                        </Tooltip>
                    )}
                </div>
            </div>

            {/* Per pollen — fixed width */}
            <div
                className={cn(
                    "w-[90px] text-center shrink-0",
                    isDisabled && "opacity-50",
                )}
            >
                <span className="inline-block text-sm font-medium bg-teal-200 text-gray-900 px-2.5 py-0.5 rounded-full">
                    {genPerPollen}
                </span>
            </div>

            {/* Input prices — fixed width */}
            <div
                className={cn("w-[100px] shrink-0", isDisabled && "opacity-50")}
            >
                <div className="flex flex-col gap-1 items-center">
                    <PriceBadge
                        prices={[model.promptTextPrice]}
                        emoji="💬"
                        subEmojis={["💬"]}
                        perToken={model.perToken}
                    />
                    <PriceBadge
                        prices={[model.promptCachedPrice]}
                        emoji="💾"
                        subEmojis={["💾"]}
                        perToken={model.perToken}
                    />
                    <PriceBadge
                        prices={[model.promptAudioPrice]}
                        emoji="🔊"
                        subEmojis={["🔊"]}
                        perToken={model.perToken}
                    />
                    <PriceBadge
                        prices={[model.promptImagePrice]}
                        emoji="🖼️"
                        subEmojis={["🖼️"]}
                        perToken={model.perToken}
                    />
                </div>
            </div>

            {/* Output prices — fixed width */}
            <div
                className={cn("w-[100px] shrink-0", isDisabled && "opacity-50")}
            >
                <div className="flex flex-col gap-1 items-center">
                    <PriceBadge
                        prices={[model.completionTextPrice]}
                        emoji="💬"
                        subEmojis={["💬"]}
                        perToken={model.perToken}
                    />
                    <PriceBadge
                        prices={[model.completionAudioPrice]}
                        emoji="🔊"
                        subEmojis={["🔊"]}
                        perToken={model.perToken}
                    />
                    <PriceBadge
                        prices={[model.perCharPrice]}
                        emoji="🔊"
                        subEmojis={["🔊"]}
                        perKChar
                    />
                    <PriceBadge
                        prices={[model.perSecondPrice]}
                        emoji={model.type === "audio" ? "🔊" : "🎬"}
                        subEmojis={[model.type === "audio" ? "🔊" : "🎬"]}
                        perSecond
                    />
                    <PriceBadge
                        prices={[model.perAudioSecondPrice]}
                        emoji="🔊"
                        subEmojis={["🔊"]}
                        perSecond
                    />
                    <PriceBadge
                        prices={[model.perTokenPrice]}
                        emoji="🎬"
                        subEmojis={["🎬"]}
                        perToken
                    />
                    <PriceBadge
                        prices={[model.perImagePrice]}
                        emoji="🖼️"
                        subEmojis={["🖼️"]}
                        perImage
                    />
                    <PriceBadge
                        prices={[model.completionImagePrice]}
                        emoji="🖼️"
                        subEmojis={["🖼️"]}
                        perToken={model.perToken}
                    />
                </div>
            </div>
        </div>
    );
};
