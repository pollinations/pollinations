import { type FC, useState } from "react";
import type { ModelPrice } from "./types.ts";
import {
    hasReasoning,
    hasVision,
    hasAudioInput,
    hasSearch,
    getModelDescription,
} from "./model-info.ts";
import { calculatePerPollen } from "./calculations.ts";
import { PriceBadge } from "./PriceBadge.tsx";

type ModelRowProps = {
    model: ModelPrice;
};

export const ModelRow: FC<ModelRowProps> = ({ model }) => {
    const modelDescription = getModelDescription(model.name);
    const genPerPollen = calculatePerPollen(model);
    const [showTooltip, setShowTooltip] = useState(false);

    // Get model capabilities
    const showReasoning = hasReasoning(model.name);
    const showVision = hasVision(model.name);
    const showAudioInput = hasAudioInput(model.name);
    const showSearch = hasSearch(model.name);

    // Show info icon if we have a description to display, or if it's a video model (for alpha notice)
    const isVideoModel = model.type === "video";
    const hasDescription = modelDescription && modelDescription !== model.name;

    // Determine pricing type for image models
    const isImageModel = model.type === "image";
    const hasFlatPricing = isImageModel && model.perImagePrice;
    const hasTokenPricing =
        isImageModel &&
        !model.perImagePrice &&
        (model.promptTextPrice || model.completionTextPrice);

    // Build pricing note for image models
    const pricingNote = hasFlatPricing
        ? "Flat rate per image (any resolution)"
        : hasTokenPricing
          ? "Token-based pricing (varies with prompt)"
          : "";

    const showDescriptionInfo =
        hasDescription || isVideoModel || (isImageModel && pricingNote);

    // Build tooltip content
    const alphaNotice = "Alpha – API may change";
    const baseContent = isVideoModel
        ? hasDescription
            ? `${modelDescription}. ${alphaNotice}`
            : alphaNotice
        : modelDescription;

    // Combine description with pricing note
    const tooltipContent =
        baseContent && pricingNote
            ? `${baseContent}. ${pricingNote}`
            : baseContent || pricingNote;

    return (
        <tr className="border-b border-gray-200">
            <td className="py-2 px-2 text-sm font-mono text-gray-700 whitespace-nowrap relative group">
                <div className="flex items-center gap-2">
                    {model.name}
                    {showDescriptionInfo && (
                        <button
                            type="button"
                            className="relative inline-flex items-center group/info"
                            onClick={() => setShowTooltip(!showTooltip)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setShowTooltip(!showTooltip);
                                }
                            }}
                            aria-label="Show model information"
                        >
                            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-100 border border-pink-300 text-pink-500 hover:bg-pink-200 hover:border-pink-400 transition-colors text-[10px] font-bold cursor-pointer">
                                i
                            </span>
                            <span
                                className={`${showTooltip ? "visible" : "invisible"} group-hover/info:visible absolute left-0 top-full mt-1 px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs rounded-lg shadow-lg border border-pink-200 whitespace-nowrap z-50 pointer-events-none`}
                            >
                                {tooltipContent}
                            </span>
                        </button>
                    )}
                    {showVision && (
                        <span
                            className="text-base"
                            title={
                                model.type === "image"
                                    ? "Vision - supports image input (image-to-image)"
                                    : "Vision - supports image input"
                            }
                        >
                            👁️
                        </span>
                    )}
                    {showAudioInput && (
                        <span className="text-base" title="Audio input support">
                            👂
                        </span>
                    )}
                    {showReasoning && (
                        <span
                            className="text-base"
                            title="Advanced reasoning capabilities"
                        >
                            🧠
                        </span>
                    )}
                    {showSearch && (
                        <span
                            className="text-base"
                            title="Web search capabilities"
                        >
                            🔍
                        </span>
                    )}
                </div>
            </td>
            <td className="py-2 px-2 text-sm">
                <div className="flex justify-center">
                    <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-yellow-100 to-orange-100 text-orange-900 border border-orange-200 ${model.type === "image" ? "uppercase" : ""}`}
                    >
                        {genPerPollen}
                    </span>
                </div>
            </td>
            <td className="py-2 px-2 text-sm text-center">
                {genPerPollen === "—" ? (
                    <span className="text-gray-400">—</span>
                ) : (
                    <div className="flex flex-wrap gap-1 justify-center">
                        <PriceBadge
                            prices={[
                                model.promptTextPrice,
                                model.promptCachedPrice,
                            ]}
                            emoji="💬"
                            subEmojis={["💬", "💾"]}
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
                )}
            </td>
            <td className="py-2 px-2 text-sm text-center">
                {genPerPollen === "—" ? (
                    <span className="text-gray-400">—</span>
                ) : (
                    <div className="flex flex-wrap gap-1 justify-center">
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
                        {model.perSecondPrice ? (
                            <PriceBadge
                                prices={[model.perSecondPrice]}
                                emoji="🎬"
                                subEmojis={["🎬"]}
                                perSecond
                            />
                        ) : model.perTokenPrice ? (
                            <PriceBadge
                                prices={[model.perTokenPrice]}
                                emoji="🎬"
                                subEmojis={["🎬"]}
                                perToken
                            />
                        ) : model.perImagePrice ? (
                            <PriceBadge
                                prices={[model.perImagePrice]}
                                emoji="🖼️"
                                subEmojis={["🖼️"]}
                                perImage
                            />
                        ) : (
                            <PriceBadge
                                prices={[model.completionImagePrice]}
                                emoji="🖼️"
                                subEmojis={["🖼️"]}
                                perToken={model.perToken}
                            />
                        )}
                    </div>
                )}
            </td>
        </tr>
    );
};
