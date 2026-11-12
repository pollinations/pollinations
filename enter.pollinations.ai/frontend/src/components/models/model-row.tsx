import { ClockIcon, formatCount, InlineLink, Tooltip } from "@pollinations/ui";
import { PUBLIC_URLS } from "@shared/public-urls.ts";
import { type FC, Fragment } from "react";
import { CatalogCard } from "../catalog-card.tsx";
import { calculatePerPollen } from "./calculations.ts";
import { ModelDescription } from "./model-description.tsx";
import {
    CAPABILITY_ICON,
    ContextIcon,
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
    hasPollinationsTools,
    isAlpha,
    isNewModel,
    isPaidOnly,
} from "./model-info.ts";
import {
    type BalanceAccess,
    BalanceAccessChip,
    ModelHealthIndicator,
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

// One of the model's facts on the capabilities line: an icon and a value, its
// meaning on hover like the icons beside it.
const ModelFact: FC<{
    Icon: FC<{ className?: string }>;
    value: string;
    label: string;
}> = ({ Icon, value, label }) => (
    <Tooltip content={label} ariaLabel={label} tapEnabled displayContents>
        <span className="inline-flex items-center gap-1">
            <Icon className="h-4 w-4" />
            <span className="text-sm font-semibold leading-none tabular-nums text-theme-text-strong">
                {value}
            </span>
        </span>
    </Tooltip>
);

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
          : `About ${value} ${requestLabel} per $1. Estimated from the median observed cost over the last 7 days.`;
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
                About {value} {requestLabel} per $1
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
                <ModelRateValue value={value} unit="req /$1" />
            )}
        </Tooltip>
    );
};

/** The model title opens the same destination on desktop and mobile. */
export function ModelTitle({ model }: { model: ModelPrice }) {
    const title = getModelDisplayName(model) || model.name;
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
            className="model-title-link inline-flex min-w-0 max-w-full items-baseline"
            aria-label={`Open ${title} in Play`}
        >
            <span className="min-w-0 truncate">{title}</span>
        </InlineLink>
    ) : (
        <span className="min-w-0 truncate">{title}</span>
    );

    return content;
}

export const ModelRow: FC<ModelRowProps> = ({ model }) => {
    const modelDescription = getModelDescriptionWithoutName(model);
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
    const balanceAccess: BalanceAccess = model.free
        ? "free"
        : showPaidOnly
          ? "paid"
          : "quest";
    const pricing = useModelPricingSelection(model);

    const videoDuration = formatVideoDuration(model);
    const baseModel = model.agent ? model.baseModel : undefined;
    const publisher = model.brandUrl && model.publisher;

    // What the model takes, can do and holds, on one line; a thin rule
    // between each group.
    const facts = [
        inputModalities.length > 0 && (
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
                        return <Icon key={key} className="h-4 w-4" />;
                    })}
                </span>
            </Tooltip>
        ),
        capabilities.length > 0 && (
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
                        return <Icon key={key} className="h-4 w-4" />;
                    })}
                </span>
            </Tooltip>
        ),
        model.contextLength != null && (
            <ModelFact
                Icon={ContextIcon}
                value={formatCount(model.contextLength)}
                label={`Context window: ${model.contextLength.toLocaleString("en")} tokens`}
            />
        ),
        videoDuration && (
            <ModelFact
                Icon={ClockIcon}
                value={videoDuration}
                label={`Video length: ${videoDuration}`}
            />
        ),
        model.perUserRpm != null && (
            <PerUserRateLimit value={model.perUserRpm} />
        ),
    ].filter(Boolean);

    // The shared catalog card, as for MCP servers and sandbox templates: all
    // about the model beside its logo, the price beside that, then the model
    // id to copy with its health next to it.
    return (
        <CatalogCard
            split="wide"
            logo={hasLeadingIcon ? <ModelBrandIcon model={model} /> : null}
            price={
                <ModelPricingLedger
                    modelName={model.displayName ?? model.name}
                    pricing={pricing}
                    className="w-full"
                    align="left"
                    requestBadge={<BalanceAccessChip access={balanceAccess} />}
                    hasTools={pollinationsTools}
                    requestEstimate={
                        !model.agent && (
                            <PerPollenEstimate model={model} ledger />
                        )
                    }
                />
            }
            copy={{ value: model.name, label: `Copy model id ${model.name}` }}
            status={
                model.health && (
                    <ModelHealthIndicator
                        health={model.health}
                        communityProxy={Boolean(
                            model.community && !model.agent,
                        )}
                    />
                )
            }
            // Who made it: at the bottom left, apart from what it is.
            note={
                publisher && (
                    <span className="flex min-w-0 items-center gap-1 text-xs text-theme-text-muted">
                        Published by
                        <InlineLink
                            href={model.brandUrl}
                            tone="quiet"
                            className="inline-flex min-w-0 items-center"
                        >
                            <span className="truncate">{publisher}</span>
                        </InlineLink>
                    </span>
                )
            }
        >
            <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-h-5 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium leading-tight">
                    <ModelTitle model={model} />
                    <ModelStatusChips
                        showNew={showNew}
                        showAlpha={showAlpha}
                        verified={Boolean(model.agent && model.verified)}
                    />
                </div>
                {modelDescription && (
                    <ModelDescription text={modelDescription} />
                )}
                {baseModel && (
                    <span className="min-w-0 max-w-full truncate text-xs leading-snug text-theme-text-muted">
                        Base model{" "}
                        <span className="text-theme-text-base">
                            {baseModel}
                        </span>
                    </span>
                )}
                {facts.length > 0 && (
                    <div className="mt-1 inline-flex min-h-5 flex-wrap items-center gap-2.5 text-theme-text-muted">
                        {facts.map((fact, index) => (
                            <Fragment key={index}>
                                {index > 0 && (
                                    <span className="h-3.5 w-px bg-current opacity-30" />
                                )}
                                {fact}
                            </Fragment>
                        ))}
                    </div>
                )}
            </div>
        </CatalogCard>
    );
};
