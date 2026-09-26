import { InlineLink, Surface, Tooltip } from "@pollinations/ui";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import type { FC, ReactNode } from "react";
import { calculatePerPollen } from "./calculations.ts";
import { CopyValue } from "./copy-value.tsx";
import {
    CAPABILITY_ICON,
    getCommunityModelIcon,
    MODALITY_ICON,
    ModelBrandIcon,
} from "./model-icons.tsx";
import {
    getModelBrandLogoPath,
    getModelCapabilities,
    getModelCapabilityLabel,
    getModelDescriptionWithoutName,
    getModelDisplayName,
    getModelInputModalities,
    getModelModalityLabel,
    getRetirementDays,
    hasPollinationsTools,
    isAlpha,
    isNewModel,
    isPaidOnly,
} from "./model-info.ts";
import {
    type BalanceAccess,
    BalanceAccessChip,
    ModelRateValue,
    ModelStatusChips,
    PerUserRateLimit,
} from "./model-status-chips.tsx";
import { isOpenWebUiChattable, OpenWebUiLink } from "./open-webui-link.tsx";
import {
    LedgerPriceValue,
    ModelPricingLedger,
    useModelPricingSelection,
} from "./price-badge.tsx";
import type { ModelPrice } from "./types.ts";

function formatVideoDuration(model: ModelPrice): string | null {
    if (model.allowedDurations?.length) {
        const ds = [...model.allowedDurations].sort((a, b) => a - b);
        if (ds.length === 1) return `${ds[0]}s`;
        return `${ds[0]}–${ds[ds.length - 1]}s`;
    }
    if (model.minDuration != null && model.maxDuration != null) {
        return model.minDuration === model.maxDuration
            ? `${model.minDuration}s`
            : `${model.minDuration}–${model.maxDuration}s`;
    }
    if (model.minDuration != null) return `${model.minDuration}s+`;
    if (model.maxDuration != null) return `≤${model.maxDuration}s`;
    return null;
}

type ModelRowProps = {
    model: ModelPrice;
};

export const PerPollenEstimate: FC<{
    model: ModelPrice;
    ledger?: boolean;
}> = ({ model, ledger = false }) => {
    const value = calculatePerPollen(model);
    const isFree = value === "∞";
    const isUnavailable = value === "—";
    const requestLabel = value === "1" ? "request" : "requests";
    const tooltipLabel = isFree
        ? "This model is free to use."
        : isUnavailable
          ? "Usage data from the last 7 days is unavailable, so this estimate cannot be calculated."
          : `About ${value} ${requestLabel} per pollen. Estimated from the median observed cost over the last 7 days.`;
    const tooltip = isFree ? (
        <span>
            This model is{" "}
            <strong className="font-semibold text-theme-text-strong">
                free
            </strong>{" "}
            to use.
        </span>
    ) : isUnavailable ? (
        <span>
            <strong className="font-semibold text-theme-text-strong">
                Usage data from the last 7 days is unavailable
            </strong>
            , so this estimate cannot be calculated.
        </span>
    ) : (
        <span className="flex flex-col gap-0.5">
            <strong className="font-semibold text-theme-text-strong">
                About {value} {requestLabel} per pollen
            </strong>
            <span className="text-theme-text-muted">
                Estimated from the median observed cost over the last 7 days.
            </span>
        </span>
    );

    return (
        <Tooltip
            triggerAs="span"
            content={tooltip}
            ariaLabel={tooltipLabel}
            tapEnabled
            displayContents
        >
            {ledger ? (
                <LedgerPriceValue
                    value={value}
                    prefix={!isFree && !isUnavailable ? "≈" : undefined}
                />
            ) : (
                <ModelRateValue value={value} unit="req /pollen" />
            )}
        </Tooltip>
    );
};

export function getModelTitleTooltipContent(model: ModelPrice): ReactNode {
    const modelDescription = getModelDescriptionWithoutName(model);
    const videoDuration = formatVideoDuration(model);

    if (
        !modelDescription &&
        (!model.agent || !model.baseModel) &&
        model.contextLength == null &&
        !videoDuration
    ) {
        return null;
    }

    return (
        <span className="flex max-w-sm flex-col gap-1.5 text-left">
            {modelDescription && <span>{modelDescription}</span>}
            {model.agent && model.baseModel && (
                <span className="text-xs text-theme-text-muted">
                    <strong className="font-semibold text-theme-text-base">
                        Base model:
                    </strong>{" "}
                    <span className="font-mono">{model.baseModel}</span>
                </span>
            )}
            {model.contextLength != null && (
                <span className="text-xs text-theme-text-muted">
                    <strong className="font-semibold text-theme-text-base">
                        Context window:
                    </strong>{" "}
                    {model.contextLength.toLocaleString()} tokens
                </span>
            )}
            {videoDuration && (
                <span className="text-xs text-theme-text-muted">
                    <strong className="font-semibold text-theme-text-base">
                        Video duration:
                    </strong>{" "}
                    {videoDuration}
                </span>
            )}
        </span>
    );
}

/** The model title opens the same destination on desktop and mobile. */
export function ModelTitle({ model }: { model: ModelPrice }) {
    const title = getModelDisplayName(model) || model.name;
    const details = getModelTitleTooltipContent(model);
    const chatSupported = isOpenWebUiChattable(model);
    const href =
        !chatSupported && !["3d", "embedding", "realtime"].includes(model.type)
            ? `${PUBLIC_URLS.root}/play?model=${encodeURIComponent(model.name)}`
            : undefined;
    const content = chatSupported ? (
        <OpenWebUiLink modelId={model.name} title={title} />
    ) : href ? (
        <InlineLink
            href={href}
            className="inline-flex min-w-0 max-w-full items-baseline"
            aria-label={`Open ${title} in Play`}
        >
            <span className="min-w-0 truncate">{title}</span>
        </InlineLink>
    ) : (
        <span className="min-w-0 truncate">{title}</span>
    );

    return details ? (
        <Tooltip
            triggerAs="span"
            content={details}
            ariaLabel={`${title}: model details`}
            className="min-w-0"
            tapEnabled={!chatSupported && !href}
            displayContents
        >
            {content}
        </Tooltip>
    ) : (
        content
    );
}

export const ModelRow: FC<ModelRowProps> = ({ model }) => {
    const brandLogoPath = getModelBrandLogoPath(model);
    const CommunityModelIcon = getCommunityModelIcon(model);
    const hasLeadingIcon = Boolean(brandLogoPath || CommunityModelIcon);
    const inputModalities = getModelInputModalities(model);
    const modalityLabel = getModelModalityLabel(model);
    const capabilities = getModelCapabilities(model);
    const capabilityLabel = getModelCapabilityLabel(model);
    const pollinationsTools = hasPollinationsTools(model);
    const showNew = isNewModel(model);
    const showPaidOnly = isPaidOnly(model);
    const showAlpha = isAlpha(model);
    const retirementDays = getRetirementDays(model);
    const balanceAccess: BalanceAccess = model.free
        ? "free"
        : showPaidOnly
          ? "paid"
          : "quest";
    const pricing = useModelPricingSelection(model);

    return (
        <Surface className="flex items-center transition-colors hover:bg-surface-opaque/90">
            {/* Brand logo — fixed width column */}
            <div className="w-10 shrink-0 flex items-center justify-center">
                <ModelBrandIcon model={model} />
            </div>

            {/* Hairline separating the brand logo from the model info —
                spaced clear of the logo square on both sides */}
            {hasLeadingIcon && (
                <span
                    aria-hidden="true"
                    className="mx-3 h-10 w-px shrink-0 self-center bg-divider"
                />
            )}

            {/* Model info — flexible width; logo-less rows pad to the same
                start (40px logo + 25px divider footprint = 65px) */}
            <div
                className={
                    brandLogoPath || CommunityModelIcon
                        ? "flex-1 min-w-0 self-stretch"
                        : "flex-1 min-w-0 self-stretch pl-[25px]"
                }
            >
                <div className="flex h-full min-w-0 flex-col justify-center gap-2">
                    <div className="flex min-h-5 min-w-0 items-center text-base font-medium leading-tight">
                        <ModelTitle model={model} />
                    </div>
                    <div className="flex min-h-5 min-w-0 items-center">
                        <CopyValue
                            value={model.name}
                            label={`Copy model id ${model.name}`}
                            showCopyIcon
                        />
                    </div>
                    {model.brandUrl && model.publisher && (
                        <InlineLink
                            href={model.brandUrl}
                            size="footer"
                            className="inline-flex min-h-5 w-fit max-w-full items-center"
                        >
                            <span className="truncate">{model.publisher}</span>
                        </InlineLink>
                    )}
                    {(inputModalities.length > 0 ||
                        capabilities.length > 0 ||
                        model.perUserRpm != null) && (
                        <div className="inline-flex min-h-5 items-center gap-2.5 text-theme-text-muted">
                            {inputModalities.length > 0 && (
                                <Tooltip
                                    content={
                                        <span>
                                            <strong className="font-semibold text-theme-text-strong">
                                                Input:
                                            </strong>{" "}
                                            {inputModalities.join(", ")}
                                        </span>
                                    }
                                    ariaLabel={modalityLabel}
                                    tapEnabled
                                    displayContents
                                >
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
                                <Tooltip
                                    content={
                                        <strong className="font-semibold text-theme-text-strong">
                                            {capabilityLabel}
                                        </strong>
                                    }
                                    ariaLabel={capabilityLabel}
                                    tapEnabled
                                    displayContents
                                >
                                    <span className="inline-flex items-center gap-2">
                                        {capabilities.map((key) => {
                                            const Icon = CAPABILITY_ICON[key];
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
                            {(inputModalities.length > 0 ||
                                capabilities.length > 0) &&
                                model.perUserRpm != null && (
                                    <span className="h-3.5 w-px bg-current opacity-30" />
                                )}
                            <PerUserRateLimit value={model.perUserRpm} />
                        </div>
                    )}
                    {(model.health ||
                        showNew ||
                        showAlpha ||
                        retirementDays) && (
                        <div className="flex min-h-5 min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                            <ModelStatusChips
                                health={model.health}
                                communityProxy={Boolean(
                                    model.community && !model.agent,
                                )}
                                showNew={showNew}
                                showAlpha={showAlpha}
                                retirementDays={retirementDays}
                                retirementDate={model.retirementDate}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="w-[clamp(312px,calc(32%_-_8px),352px)] min-w-0 shrink-0 overflow-hidden pl-3">
                <ModelPricingLedger
                    modelName={model.displayName ?? model.name}
                    pricing={pricing}
                    requestBadge={<BalanceAccessChip access={balanceAccess} />}
                    hasTools={pollinationsTools}
                    requestEstimate={<PerPollenEstimate model={model} ledger />}
                />
            </div>
        </Surface>
    );
};
