import {
    CheckIcon,
    ClipboardIcon,
    CopyButton,
    cn,
    McpIcon,
    Surface,
    Tooltip,
} from "@pollinations/ui";
import type { FC, ReactNode } from "react";
import { calculatePerPollen } from "./calculations.ts";
import {
    CAPABILITY_ICON,
    getCommunityModelIcon,
    MODALITY_ICON,
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
    ModelRateValue,
    ModelStatusChips,
    PerUserRateLimit,
} from "./model-status-chips.tsx";
import {
    ModelPricingControls,
    ModelPricingLedger,
    useModelPricingSelection,
} from "./price-badge.tsx";
import type { ModelPrice } from "./types.ts";

type ModelRowProps = {
    model: ModelPrice;
};

type ModelIdProps = {
    name: string;
    showCopyIcon?: boolean;
};

const MODEL_ID_TOOLTIP_MAX_WIDTH = 520;

export const ModelId: FC<ModelIdProps> = ({ name, showCopyIcon = false }) => (
    <CopyButton
        value={name}
        tooltip={
            showCopyIcon ? null : (
                <span className="flex min-w-0 max-w-full flex-col items-start gap-1.5 text-left">
                    <span className="font-sans text-xs font-semibold text-theme-text-strong">
                        Click to copy
                    </span>
                    <span className="max-w-full break-all font-mono text-xs text-theme-text-muted">
                        {name}
                    </span>
                </span>
            )
        }
        copiedTooltip={
            <span className="font-sans text-xs font-semibold text-intent-success-text">
                Copied
            </span>
        }
        aria-label={`Copy model id ${name}`}
        tooltipAlign="start"
        tooltipMaxWidth={MODEL_ID_TOOLTIP_MAX_WIDTH}
        tooltipClassName="min-w-0 max-w-full"
        className={(copied) =>
            cn(
                "pointer-events-auto flex min-w-0 max-w-full cursor-pointer text-left font-mono text-xs font-medium transition-colors",
                copied
                    ? "text-intent-success-text"
                    : "text-theme-text-muted hover:text-theme-text-soft",
            )
        }
    >
        {(copied) => (
            <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate">{name}</span>
                {showCopyIcon &&
                    (copied ? (
                        <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                        <ClipboardIcon className="h-3.5 w-3.5 shrink-0" />
                    ))}
                {showCopyIcon && copied && (
                    <span className="sr-only">Copied</span>
                )}
            </span>
        )}
    </CopyButton>
);

export const PerPollenEstimate: FC<{
    model: ModelPrice;
}> = ({ model }) => {
    const value = calculatePerPollen(model);
    const isFree = value === "∞";
    const isUnavailable = value === "—";
    const tooltipLabel = isFree
        ? "This model is free to use."
        : isUnavailable
          ? "Recent usage data is unavailable, so this estimate cannot be calculated."
          : `About ${value} generations per pollen. Estimated from recent usage.`;
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
                Recent usage data is unavailable
            </strong>
            , so this estimate cannot be calculated.
        </span>
    ) : (
        <span className="flex flex-col gap-0.5">
            <strong className="font-semibold text-theme-text-strong">
                About {value} generations per pollen
            </strong>
            <span className="text-theme-text-muted">
                Estimated from recent usage.
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
            <ModelRateValue value={value} unit="gen /pollen" />
        </Tooltip>
    );
};

export const PollinationsToolsCapability: FC = () => (
    <Tooltip
        triggerAs="span"
        content={
            <span className="flex max-w-xs flex-col gap-0.5 text-left">
                <strong className="font-semibold text-theme-text-strong">
                    Pollinations tools
                </strong>
                <span className="text-theme-text-muted">
                    This agent can call Pollinations models through its built-in
                    MCP connection. Generation calls are billed separately.
                </span>
            </span>
        }
        ariaLabel="Pollinations tools. This agent can call Pollinations models through its built-in MCP connection."
        tapEnabled
        displayContents
    >
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-theme-text-soft">
            <McpIcon className="h-4 w-4" />
            <span className="text-xs font-medium">Tools</span>
        </span>
    </Tooltip>
);

export function getModelTitleTooltipContent(model: ModelPrice): ReactNode {
    const modelDescription = getModelDescriptionWithoutName(model);

    if (!model.agent || !model.baseModel) return modelDescription;

    return (
        <span className="flex max-w-sm flex-col gap-1.5 text-left">
            {modelDescription && <span>{modelDescription}</span>}
            <span className="text-xs text-theme-text-muted">
                <strong className="font-semibold text-theme-text-base">
                    Base model:
                </strong>{" "}
                <span className="font-mono">{model.baseModel}</span>
            </span>
        </span>
    );
}

export const ModelRow: FC<ModelRowProps> = ({ model }) => {
    const modelDisplayName = getModelDisplayName(model);
    const brandLogoPath = getModelBrandLogoPath(model);
    const CommunityModelIcon = getCommunityModelIcon(model);
    const hasLeadingIcon = Boolean(brandLogoPath || CommunityModelIcon);
    const inputModalities = getModelInputModalities(model);
    const modalityLabel = getModelModalityLabel(model);
    const capabilities = getModelCapabilities(model);
    const capabilityLabel = getModelCapabilityLabel(model);
    const pollinationsTools = hasPollinationsTools(model);
    const publicModelName = modelDisplayName || model.name;
    const titleTooltip = getModelTitleTooltipContent(model);
    const showNew = isNewModel(model);
    const showPaidOnly = isPaidOnly(model);
    const showAlpha = isAlpha(model);
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
                {CommunityModelIcon ? (
                    <CommunityModelIcon
                        aria-hidden="true"
                        className="h-8 w-8 text-ink-900 opacity-55"
                    />
                ) : (
                    brandLogoPath && (
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
                    )
                )}
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
                        ? "flex-1 min-w-0"
                        : "flex-1 min-w-0 pl-[25px]"
                }
            >
                <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                        {titleTooltip ? (
                            <Tooltip
                                triggerAs="span"
                                content={titleTooltip}
                                ariaLabel={`${publicModelName}: model details`}
                                className="min-w-0"
                                tapEnabled
                                displayContents
                            >
                                <span className="min-w-0 truncate text-base font-medium leading-tight">
                                    {publicModelName}
                                </span>
                            </Tooltip>
                        ) : (
                            <span className="min-w-0 truncate text-base font-medium leading-tight">
                                {publicModelName}
                            </span>
                        )}
                        <ModelStatusChips
                            showNew={showNew}
                            showAlpha={showAlpha}
                        />
                    </div>
                    <ModelId name={model.name} />
                    {model.brandUrl && model.brand && (
                        <a
                            href={model.brandUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="w-fit max-w-full truncate text-xs text-theme-text-muted underline decoration-current/40 underline-offset-2 hover:text-theme-text-soft"
                        >
                            {model.brand}
                        </a>
                    )}
                    <div className="flex min-w-0 flex-col gap-0.5">
                        {(inputModalities.length > 0 ||
                            capabilities.length > 0 ||
                            pollinationsTools) && (
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <div className="inline-flex items-center gap-2.5 text-theme-text-muted">
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
                                        >
                                            <span className="inline-flex items-center gap-2">
                                                {inputModalities.map((key) => {
                                                    const Icon =
                                                        MODALITY_ICON[key];
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
                                        (capabilities.length > 0 ||
                                            pollinationsTools) && (
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
                                        >
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
                                    {pollinationsTools && (
                                        <PollinationsToolsCapability />
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="flex min-w-0 flex-nowrap items-center gap-2">
                            <PerPollenEstimate model={model} />
                            <BalanceAccessChip
                                access={balanceAccess}
                                className="whitespace-nowrap"
                            />
                        </div>
                        {model.perUserRpm != null && (
                            <div className="flex min-w-0 items-center">
                                <PerUserRateLimit value={model.perUserRpm} />
                            </div>
                        )}
                    </div>
                    <ModelPricingControls model={model} pricing={pricing} />
                </div>
            </div>

            <div className="w-[clamp(312px,calc(32%_-_8px),352px)] shrink-0 py-3 pl-3 pr-1">
                <ModelPricingLedger pricing={pricing} />
            </div>
        </Surface>
    );
};
