import {
    BookIcon,
    Button,
    ChatIcon,
    CheckIcon,
    ChevronIcon,
    Chip,
    ClockIcon,
    cn,
    DatabaseIcon,
    Dropdown,
    DropdownItem,
    ExpandIcon,
    ImageIcon,
    McpIcon,
    MicIcon,
    SearchIcon,
    SparklesIcon,
    TokensIcon,
    Tooltip,
    VideoIcon,
} from "@pollinations/ui";
import { type FC, type ReactNode, useState } from "react";
import { formatDisplayPrice } from "./formatters.ts";
import { PRICE_ICON } from "./model-icons.tsx";
import type {
    ModelPrice,
    ModelPriceAdjustment,
    ModelPriceLine,
    PriceDirection,
    PriceKind,
} from "./types.ts";

const TOKEN_TYPE_LABELS: Record<PriceKind, string> = {
    text: "text",
    image: "image",
    "3d": "3D model",
    cached: "cached",
    cacheWrite: "cache write",
    reasoning: "reasoning",
    video: "video",
    audioIn: "audio",
    audioOut: "audio",
};

const PRICE_UNIT_SUFFIX: Record<
    Exclude<ModelPriceLine["unit"], "token">,
    string
> = {
    second: "/sec",
    request: "/gen",
};

const PRICE_LINE_LABELS: Record<PriceKind, Record<PriceDirection, string>> = {
    text: { input: "Text in", output: "Text out" },
    image: { input: "Image in", output: "Image out" },
    "3d": { input: "3D in", output: "3D out" },
    cached: { input: "Cached input", output: "Cached out" },
    cacheWrite: { input: "Cache write", output: "Cache write" },
    reasoning: { input: "Reasoning in", output: "Reasoning out" },
    video: { input: "Video in", output: "Video out" },
    audioIn: { input: "Audio in", output: "Audio in" },
    audioOut: { input: "Audio out", output: "Audio out" },
};

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

const formatAdjustmentUnit = ({
    kind,
    quantity,
    unit,
}: Pick<ModelPriceAdjustment, "kind" | "quantity" | "unit">): string => {
    const quantityLabel = compactNumber
        .format(quantity)
        .replace(/^1(?=[A-Z])/, "");
    if (kind === "search_request") {
        return quantity === 1 ? "req" : `${quantityLabel} req`;
    }
    if (kind === "search_query") return `${quantityLabel} queries`;
    if (kind === "grounded_prompt") return `${quantityLabel} prompts`;
    if (kind === "cache_storage") {
        return `${quantityLabel} tokens`;
    }
    if (quantity === 1) {
        if (unit === "second") return "sec";
        if (unit === "page") return "page";
        if (unit === "generation") return "gen";
    }
    return `${quantityLabel} ${unit}`;
};

export type PriceBadgeConfig = Omit<ModelPriceLine, "direction"> & {
    subKinds: PriceKind[];
};

export const PriceBadge: FC<PriceBadgeConfig> = ({ price, unit, subKinds }) => {
    const displayedPrice = formatDisplayPrice(price, unit === "token");
    const tokenTypes = [
        ...new Set(subKinds.map((item) => TOKEN_TYPE_LABELS[item])),
    ];
    const tokenTypeLabel =
        tokenTypes.length > 1
            ? `Token types: ${tokenTypes.join(", ")}`
            : `Token type: ${tokenTypes[0]}`;

    const badge = (
        <Chip
            intent="neutral"
            size="sm"
            className="whitespace-nowrap tabular-nums"
        >
            <span className="inline-flex items-center gap-0.5">
                {subKinds.map((item) => {
                    const Icon = PRICE_ICON[item];
                    return <Icon key={item} className="h-3.5 w-3.5" />;
                })}
            </span>
            <span>
                {displayedPrice.value}
                {unit === "token"
                    ? `/${displayedPrice.tokenScale}`
                    : PRICE_UNIT_SUFFIX[unit]}
            </span>
        </Chip>
    );

    return tokenTypeLabel ? (
        <Tooltip content={tokenTypeLabel}>{badge}</Tooltip>
    ) : (
        badge
    );
};

type ModelPricingSelection = {
    prices: ModelPriceLine[];
    adjustments: ModelPriceAdjustment[];
    dropdowns: Array<{
        key: string;
        label: string;
        unit?: string;
        value: string;
        options: Array<{ value: string; label: string }>;
        onSelect: (value: string) => void;
    }>;
};

/** Each option targets an existing rate sheet, preserving later choices when possible. */
export function getPricingVariantControls(
    model: ModelPrice,
    variantName: string,
) {
    if (!model.priceVariants?.length) return [];
    const dimensions = model.pricingDimensions;
    if (!dimensions?.length) {
        return [
            {
                key: "pricing",
                label: "Pricing",
                unit: undefined,
                value: variantName,
                options: [
                    {
                        value: "",
                        label: model.priceDefaultLabel ?? "Base rate",
                    },
                    ...model.priceVariants.map(({ name, label }) => ({
                        value: name,
                        label,
                    })),
                ],
            },
        ];
    }
    const variants = ["", ...model.priceVariants.map(({ name }) => name)];
    return dimensions.map((dimension, index) => {
        const candidates = variants.filter((variant) =>
            dimensions
                .slice(0, index)
                .every(({ values }) => values[variant] === values[variantName]),
        );
        const score = (variant: string) =>
            dimensions
                .slice(index + 1)
                .filter(({ values }) => values[variant] === values[variantName])
                .length;
        const options = [
            ...new Set(candidates.map((variant) => dimension.values[variant])),
        ].map((label) => {
            const matches = candidates.filter(
                (variant) => dimension.values[variant] === label,
            );
            const value = matches.includes(variantName)
                ? variantName
                : matches.reduce((best, variant) =>
                      score(variant) > score(best) ? variant : best,
                  );
            return { value, label };
        });
        return {
            key: dimension.key,
            label: dimension.label,
            unit: dimension.unit,
            value: variantName,
            options,
        };
    });
}

export const useModelPricingSelection = (
    model: ModelPrice,
): ModelPricingSelection => {
    const [variantName, setVariantName] = useState("");
    const adjustmentOptionGroups = new Map<
        string,
        Array<NonNullable<ModelPriceAdjustment["option"]>>
    >();

    for (const adjustment of model.priceAdjustments ?? []) {
        const option = adjustment.option;
        if (!option) continue;
        const options = adjustmentOptionGroups.get(option.group) ?? [];
        if (!options.some(({ value }) => value === option.value)) {
            options.push(option);
            adjustmentOptionGroups.set(option.group, options);
        }
    }

    const [adjustmentOptions, setAdjustmentOptions] = useState<
        Record<string, string>
    >(() =>
        Object.fromEntries(
            [...adjustmentOptionGroups].map(([group, options]) => [
                group,
                options.find((option) => option.default)?.value ??
                    options[0]?.value,
            ]),
        ),
    );
    const selectedVariant = model.priceVariants?.find(
        ({ name }) => name === variantName,
    );
    const prices = selectedVariant?.prices ?? model.prices;
    const adjustments = (model.priceAdjustments ?? []).filter(
        ({ option }) =>
            !option || adjustmentOptions[option.group] === option.value,
    );
    const dropdowns = [
        ...getPricingVariantControls(model, variantName).map((dropdown) => ({
            ...dropdown,
            onSelect: setVariantName,
        })),
        ...[...adjustmentOptionGroups].map(([group, options]) => ({
            key: group,
            label: options[0].groupLabel ?? "Pricing",
            unit: options[0].unit,
            value: adjustmentOptions[group],
            options: options.map((option) => ({
                value: option.value,
                label: option.valueLabel ?? option.label,
            })),
            onSelect: (value: string) =>
                setAdjustmentOptions((current) => ({
                    ...current,
                    [group]: value,
                })),
        })),
    ];

    return { prices, adjustments, dropdowns };
};

const PRICING_OPTION_ICONS: Record<string, typeof TokensIcon> = {
    resolution: ExpandIcon,
    quality: SparklesIcon,
    operation: ImageIcon,
    reference_video: VideoIcon,
    input: ImageIcon,
    image_size: ExpandIcon,
    context: TokensIcon,
    cache: DatabaseIcon,
    prompting: ChatIcon,
    diarization: MicIcon,
    search_context: SearchIcon,
};

const ModelPricingControls: FC<{
    modelName?: string;
    pricing: ModelPricingSelection;
    align: "left" | "right";
}> = ({ modelName, pricing, align }) => (
    <>
        {pricing.dropdowns.map((dropdown) => {
            const selected = dropdown.options.find(
                ({ value }) => value === dropdown.value,
            );
            return (
                <div
                    key={dropdown.key}
                    className="grid col-span-full grid-cols-subgrid items-center py-0.5"
                >
                    {align === "right" && <span aria-hidden="true" />}
                    <LedgerLabel
                        Icon={PRICING_OPTION_ICONS[dropdown.key] ?? TokensIcon}
                        label={dropdown.label}
                    />
                    <div className="min-w-0 pr-2">
                        {dropdown.options.length === 1 ? (
                            <span className="block text-right text-xs text-theme-text-strong">
                                {selected?.label}
                            </span>
                        ) : (
                            <Dropdown
                                align="end"
                                className="w-max min-w-32 p-1"
                                trigger={(open) => (
                                    <Button
                                        type="button"
                                        size="xs"
                                        intent="neutral"
                                        aria-label={`Show prices for ${dropdown.key === "context" ? "context length" : dropdown.label.toLowerCase()}${modelName ? ` — ${modelName}` : ""}`}
                                        className="polli:w-full polli:min-w-0 polli:justify-between polli:gap-1 polli:px-1 polli:py-0 polli:text-xs polli:tabular-nums"
                                    >
                                        <span className="truncate">
                                            {selected?.label}
                                        </span>
                                        <ChevronIcon
                                            expanded={open}
                                            className="h-2.5 w-2.5 shrink-0"
                                        />
                                    </Button>
                                )}
                            >
                                {(close) => (
                                    <div
                                        role="menu"
                                        aria-label={dropdown.label}
                                    >
                                        {dropdown.options.map((option) => {
                                            const isSelected =
                                                option.value === dropdown.value;
                                            return (
                                                <DropdownItem
                                                    key={option.value}
                                                    role="menuitemradio"
                                                    aria-checked={isSelected}
                                                    className="polli:hover:bg-theme-text-muted/15 polli:hover:text-theme-text-strong polli:focus-visible:bg-theme-text-muted/15"
                                                    onClick={() => {
                                                        dropdown.onSelect(
                                                            option.value,
                                                        );
                                                        close();
                                                    }}
                                                >
                                                    <span className="flex-1">
                                                        {option.label}
                                                    </span>
                                                    {isSelected && (
                                                        <CheckIcon className="h-3.5 w-3.5" />
                                                    )}
                                                </DropdownItem>
                                            );
                                        })}
                                    </div>
                                )}
                            </Dropdown>
                        )}
                    </div>
                    <span className="whitespace-nowrap text-xs font-normal text-theme-text-muted">
                        {dropdown.unit}
                    </span>
                </div>
            );
        })}
    </>
);

export const LedgerPriceValue: FC<{
    value: string;
    prefix?: string;
}> = ({ value, prefix }) => (
    <span className="block w-full whitespace-nowrap pr-2 text-right text-sm font-semibold tabular-nums text-theme-text-strong">
        {prefix ? `${prefix} ${value}` : value}
    </span>
);

const SearchAdjustmentKinds = new Set([
    "search_request",
    "search_query",
    "grounded_prompt",
]);

const COMPACT_ADJUSTMENT_LABELS: Record<string, string> = {
    "azure.flux_2_pro.initial_output_megapixel.v1": "Initial output MP",
};

const LedgerLabel: FC<{
    label: string;
    displayLabel?: string;
    Icon?: FC<{ className?: string }>;
}> = ({ label, displayLabel = label, Icon }) => (
    <span className="grid min-w-0 grid-cols-[0.875rem_minmax(0,1fr)] items-center gap-1.5 text-xs text-theme-text-muted">
        {Icon ? (
            <Icon className="h-3.5 w-3.5 shrink-0" />
        ) : (
            <span aria-hidden="true" />
        )}
        {displayLabel !== label && <span className="sr-only">{label}</span>}
        <span
            className={cn(
                "truncate whitespace-nowrap",
                displayLabel !== label && "cursor-help",
            )}
            aria-hidden={displayLabel === label ? undefined : true}
            title={displayLabel === label ? undefined : label}
        >
            {displayLabel}
        </span>
    </span>
);

export const UsagePriceRows: FC<{
    adjustments: ModelPriceAdjustment[];
    align: "left" | "right";
}> = ({ adjustments, align }) =>
    adjustments.map((adjustment) => {
        const isSearch = SearchAdjustmentKinds.has(adjustment.kind);
        const PriceIcon = isSearch
            ? SearchIcon
            : adjustment.kind === "compute"
              ? ClockIcon
              : adjustment.kind === "page"
                ? BookIcon
                : adjustment.kind === "cache_storage"
                  ? PRICE_ICON.cached
                  : adjustment.kind in PRICE_ICON
                    ? PRICE_ICON[adjustment.kind as PriceKind]
                    : undefined;
        const unit = `/${formatAdjustmentUnit(adjustment)}`;
        const unitLabel = adjustment.suffix
            ? `${unit} · ${adjustment.suffix}`
            : unit;
        const unitContent = (
            <span
                className="min-w-0 truncate whitespace-nowrap text-xs font-normal text-theme-text-muted"
                title={unitLabel}
            >
                {unit}
            </span>
        );
        return (
            <div
                key={adjustment.name}
                className="grid col-span-full grid-cols-subgrid items-center py-0.5"
            >
                {align === "right" && <span aria-hidden="true" />}
                <LedgerLabel
                    Icon={PriceIcon}
                    label={adjustment.label}
                    displayLabel={
                        COMPACT_ADJUSTMENT_LABELS[adjustment.name] ??
                        adjustment.label
                    }
                />
                <LedgerPriceValue
                    value={formatDisplayPrice(adjustment.price).value}
                />
                {adjustment.suffix ? (
                    <Tooltip
                        triggerAs="span"
                        content={unitLabel}
                        ariaLabel={`${adjustment.label}: ${unitLabel}`}
                        tapEnabled
                        displayContents
                    >
                        {unitContent}
                    </Tooltip>
                ) : (
                    unitContent
                )}
            </div>
        );
    });

const ToolsPricingRow: FC<{ align: "left" | "right" }> = ({ align }) => (
    <div className="grid col-span-full grid-cols-subgrid items-center py-0.5">
        {align === "right" && <span aria-hidden="true" />}
        <LedgerLabel Icon={McpIcon} label="Tools" />
        <span className="col-span-2 whitespace-nowrap">
            <Tooltip
                triggerAs="span"
                content={
                    <span className="flex max-w-xs flex-col gap-0.5 text-left">
                        <strong className="font-semibold text-theme-text-strong">
                            Pollinations tools
                        </strong>
                        <span className="text-theme-text-muted">
                            This agent can call Pollinations models through MCP.
                            Each tool call is billed separately at the selected
                            model&apos;s listed rate. One agent request may make
                            multiple tool calls.
                        </span>
                    </span>
                }
                ariaLabel="Pollinations tools. Usage-based. Each tool call is billed separately at the selected model's listed rate."
                tapEnabled
                displayContents
            >
                <span className="text-sm font-semibold tabular-nums text-theme-text-strong">
                    Usage-based
                </span>
            </Tooltip>
        </span>
    </div>
);

export const ModelPricingLedger: FC<{
    modelName?: string;
    pricing: ModelPricingSelection;
    className?: string;
    align?: "left" | "right";
    hasTools?: boolean;
    requestEstimate?: ReactNode;
    requestBadge?: ReactNode;
}> = ({
    modelName,
    pricing,
    className,
    align = "right",
    hasTools = false,
    requestEstimate,
    requestBadge,
}) => {
    if (
        !pricing.dropdowns.length &&
        !pricing.prices.length &&
        !pricing.adjustments.length &&
        !hasTools &&
        !requestEstimate
    ) {
        return null;
    }

    const cachedBasePrice = pricing.prices.find(
        (price) =>
            price.direction === "input" &&
            price.kind === "cached" &&
            price.unit === "token",
    );
    const cachedModalityRates = new Map<
        PriceKind,
        {
            key: string;
            label: string;
            value: string;
        }
    >();
    const combinedAdjustmentNames = new Set<string>();

    if (cachedBasePrice) {
        const basePrice = Number(cachedBasePrice.price);
        for (const adjustment of pricing.adjustments) {
            const modality =
                adjustment.kind === "cached_audio_input"
                    ? {
                          kind: "audioIn" as const,
                          label: "Cached audio",
                      }
                    : adjustment.kind === "cached_image_input"
                      ? { kind: "image" as const, label: "Cached image" }
                      : null;
            const surcharge = Number(adjustment.price);
            const hasModalityBasePrice = pricing.prices.some(
                (price) =>
                    price.direction === "input" &&
                    price.kind === modality?.kind &&
                    price.unit === "token",
            );
            if (
                !modality ||
                !hasModalityBasePrice ||
                adjustment.quantity !== 1_000_000 ||
                !adjustment.unit.includes("token") ||
                !Number.isFinite(basePrice) ||
                !Number.isFinite(surcharge)
            ) {
                continue;
            }

            cachedModalityRates.set(modality.kind, {
                key: adjustment.name,
                label: modality.label,
                value: formatDisplayPrice(String(basePrice + surcharge)).value,
            });
            combinedAdjustmentNames.add(adjustment.name);
        }
    }

    const remainingAdjustments = pricing.adjustments.filter(
        ({ name }) => !combinedAdjustmentNames.has(name),
    );
    const extraFees = remainingAdjustments.filter(
        ({ unit }) => !unit.includes("token"),
    );
    const tokenBasedAdjustments = remainingAdjustments.filter(({ unit }) =>
        unit.includes("token"),
    );
    const cacheStorageAdjustment = tokenBasedAdjustments.find(
        ({ kind }) => kind === "cache_storage",
    );
    const cacheWritePrice = pricing.prices.find(
        (price) =>
            price.direction === "input" &&
            price.kind === "cacheWrite" &&
            price.unit === "token",
    );
    const canCombineCacheWrite =
        cacheStorageAdjustment?.quantity === 1_000_000 &&
        cacheStorageAdjustment.unit.includes("token") &&
        cacheWritePrice !== undefined &&
        Number.isFinite(Number(cacheWritePrice.price)) &&
        Number.isFinite(Number(cacheStorageAdjustment.price));
    const combinedCacheWriteValue = canCombineCacheWrite
        ? formatDisplayPrice(
              String(
                  Number(cacheWritePrice.price) +
                      Number(cacheStorageAdjustment?.price),
              ),
          ).value
        : undefined;
    const standaloneTokenAdjustments = tokenBasedAdjustments.filter(
        (adjustment) =>
            !canCombineCacheWrite || adjustment !== cacheStorageAdjustment,
    );

    const rateRows = pricing.prices.flatMap((price) => {
        const displayedPrice = formatDisplayPrice(
            price.price,
            price.unit === "token",
        );
        const rows = [
            {
                key: `${price.direction}-${price.kind}-${price.unit}`,
                label: PRICE_LINE_LABELS[price.kind][price.direction],
                value:
                    price === cacheWritePrice && combinedCacheWriteValue
                        ? combinedCacheWriteValue
                        : displayedPrice.value,
                unit:
                    price.unit === "token"
                        ? `/${displayedPrice.tokenScale} tokens`
                        : PRICE_UNIT_SUFFIX[price.unit],
                Icon: PRICE_ICON[price.kind],
                kind: price.kind,
                section:
                    price.direction === "output"
                        ? ("output" as const)
                        : price.kind === "cached" || price.kind === "cacheWrite"
                          ? ("cache" as const)
                          : ("input" as const),
            },
        ];
        const cachedModalityRate =
            price.direction === "input"
                ? cachedModalityRates.get(price.kind)
                : undefined;
        if (cachedModalityRate) {
            rows.push({
                ...cachedModalityRate,
                unit: "/M tokens",
                Icon: PRICE_ICON.cached,
                kind: "cached" as const,
                section: "cache" as const,
            });
        }
        return rows;
    });
    const inputRateRows = rateRows.filter(({ section }) => section === "input");
    const cacheRateRows = rateRows
        .filter(({ section }) => section === "cache")
        .sort(
            (left, right) =>
                Number(right.kind === "cacheWrite") -
                Number(left.kind === "cacheWrite"),
        );
    const outputRateRows = rateRows.filter(
        ({ section }) => section === "output",
    );
    const renderRateRows = (rows: typeof rateRows) =>
        rows.map((row) => {
            const PriceIcon = row.Icon;
            return (
                <div
                    key={row.key}
                    className="grid col-span-full grid-cols-subgrid items-center py-0.5"
                >
                    {align === "right" && <span aria-hidden="true" />}
                    <LedgerLabel Icon={PriceIcon} label={row.label} />
                    <LedgerPriceValue value={row.value} />
                    <span
                        className="min-w-0 cursor-help truncate whitespace-nowrap text-xs font-normal text-theme-text-muted"
                        title={row.unit}
                    >
                        {row.unit}
                    </span>
                </div>
            );
        });

    return (
        <div
            className={cn(
                "grid w-full min-w-0 max-w-full gap-x-1",
                align === "left"
                    ? "grid-cols-[6.5rem_10ch_minmax(0,1fr)] min-[480px]:grid-cols-[8rem_10ch_4rem]"
                    : "grid-cols-[1fr_8rem_10ch_4rem]",
                className,
            )}
        >
            {requestEstimate && (
                <div
                    className={cn(
                        "mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-divider pt-0.5 pb-1",
                        align === "right"
                            ? "col-start-2 col-end-[-1]"
                            : "col-span-full",
                    )}
                >
                    {requestEstimate}
                    {requestBadge}
                </div>
            )}
            {(pricing.dropdowns.length > 0 ||
                extraFees.length > 0 ||
                hasTools) && (
                <div className="grid col-span-full grid-cols-subgrid">
                    <ModelPricingControls
                        modelName={modelName}
                        pricing={pricing}
                        align={align}
                    />
                    <UsagePriceRows adjustments={extraFees} align={align} />
                    {hasTools && <ToolsPricingRow align={align} />}
                    {(rateRows.length > 0 ||
                        standaloneTokenAdjustments.length > 0) && (
                        <span
                            aria-hidden="true"
                            className={cn(
                                "col-end-[-1] my-1 border-t border-divider",
                                align === "right"
                                    ? "col-start-2"
                                    : "col-start-1",
                            )}
                        />
                    )}
                </div>
            )}
            {inputRateRows.length > 0 && (
                <div className="grid col-span-full grid-cols-subgrid">
                    {renderRateRows(inputRateRows)}
                </div>
            )}
            {(cacheRateRows.length > 0 ||
                standaloneTokenAdjustments.length > 0) && (
                <div className="grid col-span-full grid-cols-subgrid">
                    {renderRateRows(cacheRateRows)}
                    <UsagePriceRows
                        adjustments={standaloneTokenAdjustments}
                        align={align}
                    />
                </div>
            )}
            {outputRateRows.length > 0 && (
                <div className="grid col-span-full grid-cols-subgrid">
                    {renderRateRows(outputRateRows)}
                </div>
            )}
        </div>
    );
};
