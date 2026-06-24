import {
    CardIcon,
    CopyButton,
    cn,
    InfoTip,
    SproutIcon,
    Surface,
    Tooltip,
} from "@pollinations/ui";
import {
    PaidChip,
    TierChip,
    WalletKindIcon,
} from "@pollinations/ui/wallet";
import type { FC } from "react";
import { calculatePerPollen, unitLabels } from "./calculations.ts";
import { CAPABILITY_ICON, MODALITY_ICON } from "./model-icons.tsx";
import {
    getModelBrandLogoPath,
    getModelCapabilities,
    getModelCapabilityLabel,
    getModelDescriptionWithoutName,
    getModelDisplayName,
    getModelInputModalities,
    getModelModalityLabel,
    isAlpha,
    isNewModel,
    isPaidOnly,
} from "./model-info.ts";
import { ModelStatusChips } from "./model-status-chips.tsx";
import { groupPriceBadges, PriceBadge } from "./price-badge.tsx";
import type { ModelPrice } from "./types.ts";

type ModelRowProps = {
    model: ModelPrice;
};

export const ModelRow: FC<ModelRowProps> = ({ model }) => {
    const modelDisplayName = getModelDisplayName(model);
    const modelDescription = getModelDescriptionWithoutName(model);
    const brandLogoPath = getModelBrandLogoPath(model);
    const inputModalities = getModelInputModalities(model);
    const modalityLabel = getModelModalityLabel(model);
    const capabilities = getModelCapabilities(model);
    const capabilityLabel = getModelCapabilityLabel(model);
    const publicModelName = modelDisplayName || model.name;
    const showNew = isNewModel(model);
    const showPaidOnly = isPaidOnly(model);
    const showAlpha = isAlpha(model);

    const genPerPollen = calculatePerPollen(model);
    const balanceLabel = showPaidOnly ? (
        <span className="inline-flex items-center gap-1">
            <WalletKindIcon kind="paid" />
            Paid Pollen only
        </span>
    ) : (
        <span className="inline-flex items-center gap-1">
            <WalletKindIcon kind="tier" />
            Quest or <WalletKindIcon kind="paid" />
            Paid Pollen
        </span>
    );
    const perPollenTooltip =
        genPerPollen === "—" ? (
            balanceLabel
        ) : (
            <span className="flex flex-col gap-0.5">
                <span>
                    ≈ {genPerPollen} {unitLabels[model.type] ?? "requests"} per
                    pollen
                </span>
                {balanceLabel}
            </span>
        );
    const inputPriceBadges = groupPriceBadges([
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
            perRequest: model.perRequest,
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
    ]);
    const outputPriceBadges = groupPriceBadges([
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
            perRequest: model.perRequest,
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
            perRequest: true,
        },
        {
            prices: [model.completionImagePrice],
            kind: "image",
            subKinds: ["image"],
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

            {/* Hairline separating the brand logo from the model info —
                spaced clear of the logo square on both sides */}
            {brandLogoPath && (
                <span
                    aria-hidden="true"
                    className="mx-3 h-10 w-px shrink-0 self-center bg-divider"
                />
            )}

            {/* Model info — flexible width; logo-less rows pad to the same
                start (40px logo + 25px divider footprint = 65px) */}
            <div
                className={
                    brandLogoPath
                        ? "flex-1 min-w-0"
                        : "flex-1 min-w-0 pl-[25px]"
                }
            >
                <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                        <CopyButton
                            value={model.name}
                            tooltip={`Copy "${model.name}"`}
                            copiedTooltip={null}
                            aria-label={`Copy model id ${model.name}`}
                            className={(copied) =>
                                cn(
                                    "flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-base font-medium leading-none transition-colors",
                                    copied
                                        ? "text-intent-success-text"
                                        : "hover:text-theme-text-soft",
                                )
                            }
                        >
                            <span className="min-w-0 truncate">
                                {publicModelName}
                            </span>
                        </CopyButton>
                        {modelDescription && (
                            <InfoTip
                                content={modelDescription}
                                label={`About ${publicModelName}`}
                            />
                        )}
                        <ModelStatusChips
                            showNew={showNew}
                            showAlpha={showAlpha}
                        />
                    </div>
                    {(inputModalities.length > 0 ||
                        capabilities.length > 0) && (
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-2.5 text-theme-text-muted">
                                {inputModalities.length > 0 && (
                                    <Tooltip content={modalityLabel}>
                                        <span className="inline-flex items-center gap-2">
                                            {inputModalities.map((key) => {
                                                const Icon = MODALITY_ICON[key];
                                                return (
                                                    <Icon
                                                        key={key}
                                                        className="h-4 w-4"
                                                    />
                                                );
                                            })}
                                        </span>
                                    </Tooltip>
                                )}
                                {inputModalities.length > 0 &&
                                    capabilities.length > 0 && (
                                        <span className="h-3.5 w-px bg-current opacity-30" />
                                    )}
                                {capabilities.length > 0 && (
                                    <Tooltip content={capabilityLabel}>
                                        <span className="inline-flex items-center gap-2 text-theme-text-soft">
                                            {capabilities.map((key) => {
                                                const Icon =
                                                    CAPABILITY_ICON[key];
                                                return (
                                                    <Icon
                                                        key={key}
                                                        className="h-4 w-4"
                                                    />
                                                );
                                            })}
                                        </span>
                                    </Tooltip>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Per pollen — fixed width; gold + card for paid-only models, green
                + sprout for tier-eligible models (replaces the old PAID badge) */}
            <div className="w-[90px] text-center shrink-0">
                <Tooltip content={perPollenTooltip} displayContents>
                    {showPaidOnly ? (
                        <PaidChip>
                            <CardIcon className="h-3.5 w-3.5" />
                            {genPerPollen}
                        </PaidChip>
                    ) : (
                        <TierChip>
                            <SproutIcon className="h-3.5 w-3.5" />
                            {genPerPollen}
                        </TierChip>
                    )}
                </Tooltip>
            </div>

            {/* Input prices — fixed width */}
            <div className="w-[100px] shrink-0">
                <div className="flex flex-col gap-1 items-end">
                    {inputPriceBadges.map((badge) => (
                        <PriceBadge
                            key={`${badge.subKinds.join("")}-${badge.prices[0]}-${badge.perToken ? "token" : ""}-${badge.perRequest ? "gen" : ""}-${badge.perSecond ? "sec" : ""}`}
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
                            key={`${badge.subKinds.join("")}-${badge.prices[0]}-${badge.perToken ? "token" : ""}-${badge.perRequest ? "gen" : ""}-${badge.perSecond ? "sec" : ""}`}
                            {...badge}
                        />
                    ))}
                </div>
            </div>
        </Surface>
    );
};
