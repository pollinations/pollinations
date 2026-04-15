import { type FC, useState } from "react";
import { cn } from "../../../util.ts";
import { Badge } from "../ui/badge.tsx";
import {
    calculateForBalance,
    calculatePerPollen,
    TOP_UP_TOOLTIP,
} from "./calculations.ts";
import {
    getModelBrandLogoPath,
    getModelCapabilityIcons,
    getModelCapabilityLabel,
    getModelDisplayName,
    getModelModalityIcons,
    getModelModalityLabel,
    getModelProfile,
    isAlpha,
    isNewModel,
    isPaidOnly,
    MODEL_COPY_CURSOR,
} from "./model-info.ts";
import { PriceBadge } from "./price-badge.tsx";
import { Tooltip } from "./Tooltip.tsx";
import type { ModelPrice } from "./types.ts";

type ModelRowProps = {
    model: ModelPrice;
    tierBalance?: number;
    packBalance?: number;
    cryptoBalance?: number;
};

export const ModelRow: FC<ModelRowProps> = ({
    model,
    tierBalance,
    packBalance,
    cryptoBalance,
}) => {
    const modelDisplayName = getModelDisplayName(model.name);
    const brandLogoPath = getModelBrandLogoPath(model.name);
    const modelProfile = getModelProfile(model.name);
    const modalityIcons = getModelModalityIcons(model.name);
    const modalityLabel = getModelModalityLabel(model.name);
    const capabilityIcons = getModelCapabilityIcons(model.name);
    const capabilityLabel = getModelCapabilityLabel(model.name);
    const publicModelName = modelDisplayName || model.name;
    const [copied, setCopied] = useState(false);
    const showNew = isNewModel(model.name);
    const showPaidOnly = isPaidOnly(model.name);
    const showAlpha = isAlpha(model.name);

    const isSignedIn = packBalance !== undefined;
    const paidBalance = (packBalance ?? 0) + (cryptoBalance ?? 0);
    const totalBalance = (tierBalance ?? 0) + paidBalance;
    const effectiveBalance = showPaidOnly ? paidBalance : totalBalance;

    const genPerPollen = calculatePerPollen(model);
    const balanceRequests = isSignedIn
        ? calculateForBalance(model, effectiveBalance)
        : null;
    const isDisabled = isSignedIn && balanceRequests === "0";

    const copyModelName = async () => {
        await navigator.clipboard.writeText(publicModelName);
        setCopied(true);
        setTimeout(() => setCopied(false), 900);
    };

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
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={copyModelName}
                        className={cn(
                            "inline-flex items-center gap-2 text-sm text-left transition-colors",
                            showNew ? "font-bold" : "font-medium",
                            copied ? "text-gray-500" : "hover:text-gray-700",
                            isDisabled && "opacity-75",
                        )}
                        aria-label={`Copy model name ${publicModelName}`}
                        style={{ cursor: MODEL_COPY_CURSOR }}
                    >
                        {brandLogoPath && (
                            <span
                                aria-hidden="true"
                                className="h-3.5 w-3.5 shrink-0 bg-current opacity-55"
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
                        <span>{publicModelName}</span>
                    </button>
                    {modalityIcons.length > 0 && (
                        <span className={cn(isDisabled && "opacity-50")}>
                            <Tooltip content={modalityLabel}>
                                <Badge
                                    color="gray"
                                    size="sm"
                                    className="border border-gray-900 bg-transparent text-gray-900"
                                >
                                    {modalityIcons.map((emoji) => (
                                        <span key={emoji}>{emoji}</span>
                                    ))}
                                </Badge>
                            </Tooltip>
                        </span>
                    )}
                    {capabilityIcons.length > 0 && (
                        <span className={cn(isDisabled && "opacity-50")}>
                            <Tooltip content={capabilityLabel}>
                                <Badge
                                    color="gray"
                                    size="sm"
                                    className="border border-gray-900 bg-transparent text-gray-900"
                                >
                                    {capabilityIcons.map((emoji) => (
                                        <span key={emoji}>{emoji}</span>
                                    ))}
                                </Badge>
                            </Tooltip>
                        </span>
                    )}
                    {modelProfile && (
                        <span className={cn(isDisabled && "opacity-50")}>
                            <Badge
                                color={
                                    modelProfile === "fast" ? "blue" : "pink"
                                }
                                size="sm"
                                className="font-semibold tracking-[0.04em]"
                            >
                                {modelProfile.toUpperCase()}
                            </Badge>
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
                                        ? TOP_UP_TOOLTIP
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
            </div>

            {/* Per pollen — fixed width */}
            <div className="w-[90px] text-center shrink-0">
                {isSignedIn ? (
                    <Tooltip
                        content={
                            <span className="text-xs">
                                {isDisabled
                                    ? TOP_UP_TOOLTIP
                                    : `≈ ${balanceRequests} with current balance`}
                            </span>
                        }
                    >
                        <span
                            className={cn(
                                "inline-block text-sm font-medium bg-teal-200 text-gray-900 px-2.5 py-0.5 rounded-full cursor-help",
                                isDisabled && "opacity-50",
                            )}
                        >
                            {genPerPollen}
                        </span>
                    </Tooltip>
                ) : (
                    <span className="inline-block text-sm font-medium bg-teal-200 text-gray-900 px-2.5 py-0.5 rounded-full">
                        {genPerPollen}
                    </span>
                )}
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
                        emoji="🎙️"
                        subEmojis={["🎙️"]}
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
