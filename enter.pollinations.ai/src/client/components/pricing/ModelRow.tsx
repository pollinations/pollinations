import { type FC, useState } from "react";
import { calculatePerPollen } from "./calculations.ts";
import {
    getModelDisplayName,
    hasAudioInput,
    hasAudioOutput,
    hasCodeExecution,
    hasReasoning,
    hasSearch,
    hasVision,
    isNewModel,
    isPaidOnly,
} from "./model-info.ts";
import { PriceBadge } from "./PriceBadge.tsx";
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
    const capabilities = {
        reasoning: hasReasoning(model.name),
        vision: hasVision(model.name),
        audioInput: hasAudioInput(model.name),
        audioOutput: hasAudioOutput(model.name),
        search: hasSearch(model.name),
        codeExecution: hasCodeExecution(model.name),
        isNew: isNewModel(model.name),
        isPaidOnly: isPaidOnly(model.name),
    };
    const isDisabled = capabilities.isPaidOnly && packBalance <= 0;

    const borderClass = isLast ? "" : "border-b border-gray-200";
    const badgeClass = capabilities.isPaidOnly
        ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-purple-200 text-purple-700"
        : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-cyan-200 text-cyan-700";

    return (
        <tr className={isDisabled ? "opacity-50" : ""}>
            <td
                className={`py-2 px-2 text-sm text-gray-700 relative group ${borderClass}`}
            >
                <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                        <span
                            className={
                                capabilities.isNew ? "font-bold" : "font-medium"
                            }
                        >
                            {modelDisplayName || model.name}
                        </span>
                        <button
                            type="button"
                            onClick={copyModelName}
                            className="text-xs text-gray-500 font-mono hover:text-gray-700 cursor-pointer text-left"
                            title="Click to copy"
                        >
                            {copied ? "✓ copied" : model.name}
                        </button>
                    </div>
                    {capabilities.vision && (
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
                    {capabilities.audioInput && (
                        <Tooltip content="Audio input">
                            <span className="text-base">🎙️</span>
                        </Tooltip>
                    )}
                    {capabilities.audioOutput && (
                        <Tooltip content="Audio output">
                            <span className="text-base">🔊</span>
                        </Tooltip>
                    )}
                    {capabilities.reasoning && (
                        <Tooltip content="Reasoning">
                            <span className="text-base">🧠</span>
                        </Tooltip>
                    )}
                    {capabilities.search && (
                        <Tooltip content="Web search">
                            <span className="text-base">🔍</span>
                        </Tooltip>
                    )}
                    {capabilities.codeExecution && (
                        <Tooltip content="Code execution">
                            <span className="text-base">💻</span>
                        </Tooltip>
                    )}
                    {capabilities.isNew && (
                        <span className="text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full font-semibold border border-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)] animate-[glow_2s_ease-in-out_infinite]">
                            NEW
                        </span>
                    )}
                    {capabilities.isPaidOnly && (
                        <Tooltip
                            content={
                                isDisabled
                                    ? "Top up your 💎 pollen balance to unlock this model."
                                    : "This model uses your purchased pollen 💎 only."
                            }
                        >
                            <span className="text-[10px] text-purple-700 bg-transparent px-1.5 py-0.5 rounded-full font-semibold border border-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.5)] animate-[glow-purple_2s_ease-in-out_infinite]">
                                💎 PAID ONLY
                            </span>
                        </Tooltip>
                    )}
                </div>
            </td>
            <td className={`py-2 px-2 text-sm ${borderClass}`}>
                <div className="flex justify-center">
                    <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${model.type === "image" ? "uppercase" : ""} ${capabilities.isPaidOnly ? "bg-purple-200 text-purple-700 border border-purple-300" : "bg-cyan-200 text-cyan-700 border border-cyan-300"}`}
                    >
                        {genPerPollen}
                    </span>
                </div>
            </td>
            <td className={`py-2 px-2 text-sm text-center ${borderClass}`}>
                <div className="flex flex-col gap-1 items-center">
                    <PriceBadge
                        prices={[model.promptTextPrice]}
                        emoji="💬"
                        subEmojis={["💬"]}
                        perToken={model.perToken}
                        className={badgeClass}
                    />
                    <PriceBadge
                        prices={[model.promptCachedPrice]}
                        emoji="💾"
                        subEmojis={["💾"]}
                        perToken={model.perToken}
                        className={badgeClass}
                    />
                    <PriceBadge
                        prices={[model.promptAudioPrice]}
                        emoji="🔊"
                        subEmojis={["🔊"]}
                        perToken={model.perToken}
                        className={badgeClass}
                    />
                    <PriceBadge
                        prices={[model.promptImagePrice]}
                        emoji="🖼️"
                        subEmojis={["🖼️"]}
                        perToken={model.perToken}
                        className={badgeClass}
                    />
                </div>
            </td>
            <td className={`py-2 px-2 text-sm text-center ${borderClass}`}>
                {
                    <div className="flex flex-col gap-1 items-center">
                        <PriceBadge
                            prices={[model.completionTextPrice]}
                            emoji="💬"
                            subEmojis={["💬"]}
                            perToken={model.perToken}
                            className={
                                capabilities.isPaidOnly
                                    ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-purple-200 text-purple-700"
                                    : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-cyan-200 text-cyan-700"
                            }
                        />
                        <PriceBadge
                            prices={[model.completionAudioPrice]}
                            emoji="🔊"
                            subEmojis={["🔊"]}
                            perToken={model.perToken}
                            className={
                                capabilities.isPaidOnly
                                    ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-purple-200 text-purple-700"
                                    : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-cyan-200 text-cyan-700"
                            }
                        />
                        {model.perSecondPrice ? (
                            <>
                                <PriceBadge
                                    prices={[model.perSecondPrice]}
                                    emoji="🎬"
                                    subEmojis={["🎬"]}
                                    perSecond
                                    className={
                                        capabilities.isPaidOnly
                                            ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-purple-200 text-purple-700"
                                            : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-cyan-200 text-cyan-700"
                                    }
                                />
                                <PriceBadge
                                    prices={[model.perAudioSecondPrice]}
                                    emoji="🔊"
                                    subEmojis={["🔊"]}
                                    perSecond
                                    className={
                                        capabilities.isPaidOnly
                                            ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-purple-200 text-purple-700"
                                            : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-cyan-200 text-cyan-700"
                                    }
                                />
                            </>
                        ) : model.perTokenPrice ? (
                            <PriceBadge
                                prices={[model.perTokenPrice]}
                                emoji="🎬"
                                subEmojis={["🎬"]}
                                perToken
                                className={
                                    capabilities.isPaidOnly
                                        ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-purple-200 text-purple-700"
                                        : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-cyan-200 text-cyan-700"
                                }
                            />
                        ) : model.perImagePrice ? (
                            <PriceBadge
                                prices={[model.perImagePrice]}
                                emoji="🖼️"
                                subEmojis={["🖼️"]}
                                perImage
                                className={
                                    capabilities.isPaidOnly
                                        ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-purple-200 text-purple-700"
                                        : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-cyan-200 text-cyan-700"
                                }
                            />
                        ) : (
                            <PriceBadge
                                prices={[model.completionImagePrice]}
                                emoji="🖼️"
                                subEmojis={["🖼️"]}
                                perToken={model.perToken}
                                className={
                                    capabilities.isPaidOnly
                                        ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-purple-200 text-purple-700"
                                        : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-cyan-200 text-cyan-700"
                                }
                            />
                        )}
                    </div>
                }
            </td>
        </tr>
    );
};
