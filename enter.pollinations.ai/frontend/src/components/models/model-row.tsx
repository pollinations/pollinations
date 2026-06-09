import { Chip, Surface, Tooltip } from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import type { FC } from "react";
import { calculatePerPollen } from "./calculations.ts";
import {
    getModelBrandLogoPath,
    getModelCapabilityIcons,
    getModelCapabilityLabel,
    getModelDescriptionWithoutName,
    getModelDisplayName,
    getModelModalityIcons,
    getModelModalityLabel,
    isAlpha,
    isNewModel,
    isPaidOnly,
} from "./model-info.ts";
import { groupPriceBadges, PriceBadge } from "./price-badge.tsx";
import type { ModelPrice } from "./types.ts";

type ModelRowProps = {
    model: ModelPrice;
};

export const ModelRow: FC<ModelRowProps> = ({ model }) => {
    const modelDisplayName = getModelDisplayName(model.name);
    const modelDescription = getModelDescriptionWithoutName(model.name);
    const brandLogoPath = getModelBrandLogoPath(model.name);
    const modalityIcons = getModelModalityIcons(model.name);
    const modalityLabel = getModelModalityLabel(model.name);
    const capabilityIcons = getModelCapabilityIcons(model.name);
    const capabilityLabel = getModelCapabilityLabel(model.name);
    const publicModelName = modelDisplayName || model.name;
    const showNew = isNewModel(model.name);
    const showPaidOnly = isPaidOnly(model.name);
    const showAlpha = isAlpha(model.name);

    const genPerPollen = calculatePerPollen(model);
    const inputPriceBadges = groupPriceBadges([
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
        {
            prices: [model.promptVideoPrice],
            emoji: "🎬",
            subEmojis: ["🎬"],
            perToken: model.perToken,
        },
    ]);
    const outputPriceBadges = groupPriceBadges([
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
    ]);

    return (
        <Surface className="flex items-center transition-colors hover:bg-surface-opaque/90">
            {/* Brand logo — fixed width column */}
            <div className="w-10 shrink-0 flex items-center justify-center">
                {brandLogoPath && (
                    <span
                        aria-hidden="true"
                        className="h-8 w-8 bg-current opacity-55 text-ink-900"
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
            </div>

            {/* Model info — flexible width */}
            <div className="flex-1 min-w-0 pl-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                    {modelDescription ? (
                        <Tooltip
                            triggerAs="span"
                            content={modelDescription}
                            className="self-start"
                        >
                            <span className="text-base font-medium leading-none">
                                {publicModelName}
                            </span>
                        </Tooltip>
                    ) : (
                        <span className="text-base font-medium leading-none">
                            {publicModelName}
                        </span>
                    )}
                    {(modalityIcons.length > 0 ||
                        capabilityIcons.length > 0 ||
                        showNew ||
                        showAlpha ||
                        showPaidOnly) && (
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {modalityIcons.length > 0 && (
                                <Tooltip content={modalityLabel}>
                                    <Chip size="sm">
                                        {modalityIcons.map((emoji) => (
                                            <span key={emoji}>{emoji}</span>
                                        ))}
                                    </Chip>
                                </Tooltip>
                            )}
                            {capabilityIcons.length > 0 && (
                                <Tooltip content={capabilityLabel}>
                                    <Chip size="sm">
                                        {capabilityIcons.map((emoji) => (
                                            <span key={emoji}>{emoji}</span>
                                        ))}
                                    </Chip>
                                </Tooltip>
                            )}
                            {showNew && (
                                <Chip intent="news" size="sm">
                                    NEW
                                </Chip>
                            )}
                            {showAlpha && (
                                <Tooltip content="🧪 Alpha model — experimental, may be unstable">
                                    <Chip intent="alpha" size="sm">
                                        ALPHA
                                    </Chip>
                                </Tooltip>
                            )}
                            {showPaidOnly && (
                                <Tooltip content="💳 This model uses paid balance only.">
                                    <PaidChip size="sm">PAID</PaidChip>
                                </Tooltip>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Per pollen — fixed width; paid color for paid models, tier color
                for tier models */}
            <div className="w-[90px] text-center shrink-0">
                {showPaidOnly ? (
                    <PaidChip>{genPerPollen}</PaidChip>
                ) : (
                    <TierChip>{genPerPollen}</TierChip>
                )}
            </div>

            {/* Input prices — fixed width */}
            <div className="w-[100px] shrink-0">
                <div className="flex flex-col gap-1 items-end">
                    {inputPriceBadges.map((badge) => (
                        <PriceBadge
                            key={`${badge.subEmojis.join("")}-${badge.prices[0]}-${badge.perToken ? "token" : ""}-${badge.perImage ? "img" : ""}-${badge.perSecond ? "sec" : ""}`}
                            {...badge}
                        />
                    ))}
                </div>
            </div>

            {/* Output prices — fixed width */}
            <div className="w-[100px] shrink-0">
                <div className="flex flex-col gap-1 items-end">
                    {outputPriceBadges.map((badge) => (
                        <PriceBadge
                            key={`${badge.subEmojis.join("")}-${badge.prices[0]}-${badge.perToken ? "token" : ""}-${badge.perImage ? "img" : ""}-${badge.perSecond ? "sec" : ""}`}
                            {...badge}
                        />
                    ))}
                </div>
            </div>
        </Surface>
    );
};
