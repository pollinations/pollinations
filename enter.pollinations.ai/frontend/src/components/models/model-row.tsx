import { Chip, CopyButton, cn, InfoTip, Tooltip } from "@pollinations/ui";
import { PaidChip } from "@pollinations/ui/wallet";
import type { FC } from "react";
import {
    calculatePerPollen,
    canAffordModel,
    TOP_UP_TOOLTIP,
} from "./calculations.ts";
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
    tierBalance?: number;
    packBalance?: number;
};

export const ModelRow: FC<ModelRowProps> = ({
    model,
    tierBalance,
    packBalance,
}) => {
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

    const isSignedIn = packBalance !== undefined;
    const genPerPollen = calculatePerPollen(model);
    const isDisabled =
        isSignedIn &&
        !canAffordModel(
            model,
            tierBalance ?? 0,
            packBalance ?? 0,
            showPaidOnly,
        );
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
        <div
            className={cn(
                "flex items-center rounded-xl p-4",
                isDisabled
                    ? "bg-transparent"
                    : "bg-surface-opaque/80 hover:bg-surface-opaque/90 transition-colors",
            )}
        >
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
                    <span className="inline-flex items-center text-base font-medium leading-none">
                        <span>{publicModelName}</span>
                        {modelDescription && (
                            <InfoTip text={modelDescription} />
                        )}
                    </span>
                    <CopyButton
                        value={model.name}
                        copiedTimeoutMs={900}
                        tooltip={`Copy API model name ${model.name}`}
                        aria-label={`Copy API model name ${model.name}`}
                        className={(copied) =>
                            cn(
                                "inline-flex cursor-pointer items-center gap-1.5 self-start text-left text-xs font-medium leading-none text-ink-500 transition-colors",
                                copied
                                    ? "text-accent-teal-700"
                                    : "hover:text-ink-700",
                            )
                        }
                    >
                        {(copied) => (
                            <>
                                <span>{model.name}</span>
                                {copied && (
                                    <span className="rounded-lg bg-accent-teal-100 px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide text-accent-teal-700">
                                        copied
                                    </span>
                                )}
                            </>
                        )}
                    </CopyButton>
                    {(modalityIcons.length > 0 ||
                        capabilityIcons.length > 0 ||
                        showNew ||
                        showAlpha ||
                        showPaidOnly) && (
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {modalityIcons.length > 0 && (
                                <Tooltip content={modalityLabel}>
                                    <Chip intent="neutral" size="sm">
                                        {modalityIcons.map((emoji) => (
                                            <span key={emoji}>{emoji}</span>
                                        ))}
                                    </Chip>
                                </Tooltip>
                            )}
                            {capabilityIcons.length > 0 && (
                                <Tooltip content={capabilityLabel}>
                                    <Chip intent="neutral" size="sm">
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
                                <Tooltip content="Alpha model — experimental, may be unstable">
                                    <Chip intent="alpha" size="sm">
                                        ALPHA
                                    </Chip>
                                </Tooltip>
                            )}
                            {showPaidOnly && (
                                <Tooltip
                                    content={
                                        isDisabled
                                            ? TOP_UP_TOOLTIP
                                            : "This model uses paid balance only."
                                    }
                                >
                                    <PaidChip size="sm">PAID</PaidChip>
                                </Tooltip>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Per pollen — fixed width */}
            <div className="w-[90px] text-center shrink-0">
                <Chip>{genPerPollen}</Chip>
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
        </div>
    );
};
