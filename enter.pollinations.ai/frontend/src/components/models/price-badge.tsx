import {
    Button,
    CheckIcon,
    ChevronIcon,
    Chip,
    cn,
    Dropdown,
    DropdownItem,
    Tooltip,
} from "@pollinations/ui";
import { type FC, useState } from "react";
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
    cached: { input: "Cached in", output: "Cached out" },
    cacheWrite: { input: "Cache write", output: "Cache write" },
    reasoning: { input: "Reasoning in", output: "Reasoning out" },
    video: { input: "Video in", output: "Video out" },
    audioIn: { input: "Audio in", output: "Audio in" },
    audioOut: { input: "Audio out", output: "Audio out" },
};

const PRICE_LEDGER_UNIT: Record<
    Exclude<ModelPriceLine["unit"], "token">,
    string
> = {
    second: "/sec",
    request: "/gen",
};

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

const formatAdjustmentUnit = ({
    label,
    kind,
    quantity,
    unit,
    suffix,
}: Pick<
    ModelPriceAdjustment,
    "label" | "kind" | "quantity" | "unit" | "suffix"
>): string => {
    const quantityLabel = compactNumber.format(quantity);
    if (label === "Search") return `${quantityLabel} request`;
    if (kind === "cache_storage") return `${quantityLabel} tokens`;
    return `${quantityLabel} ${unit}${suffix ? ` · ${suffix}` : ""}`;
};

export type PriceBadgeConfig = Omit<ModelPriceLine, "direction"> & {
    subKinds: PriceKind[];
};

const groupPriceBadges = (prices: ModelPriceLine[]): PriceBadgeConfig[] => {
    const grouped = new Map<string, PriceBadgeConfig>();

    for (const price of prices) {
        const key = [price.price, price.unit].join("|");
        const existing = grouped.get(key);
        if (existing) {
            existing.subKinds = [
                ...new Set([...existing.subKinds, price.kind]),
            ];
            continue;
        }

        grouped.set(key, {
            price: price.price,
            kind: price.kind,
            unit: price.unit,
            subKinds: [price.kind],
        });
    }

    return [...grouped.values()];
};

export const getModelPriceBadges = (
    model: ModelPrice,
    direction: PriceDirection,
): PriceBadgeConfig[] =>
    groupPriceBadges(
        model.prices.filter((price) => price.direction === direction),
    );

const getPriceBadgeKey = (badge: PriceBadgeConfig): string =>
    [badge.subKinds.join(""), badge.price, badge.unit].join("-");

type PriceBadgeListProps = {
    badges: PriceBadgeConfig[];
    className?: string;
};

export const PriceBadgeList: FC<PriceBadgeListProps> = ({
    badges,
    className,
}) => (
    <div className={className}>
        {badges.map((badge) => (
            <PriceBadge key={getPriceBadgeKey(badge)} {...badge} />
        ))}
    </div>
);

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
        value: string;
        options: Array<{ value: string; label: string }>;
        onSelect: (value: string) => void;
    }>;
};

export const useModelPricingSelection = (
    model: ModelPrice,
): ModelPricingSelection => {
    const [variantName, setVariantName] = useState("");
    const adjustmentOptionGroups = new Map<
        string,
        Array<{ value: string; label: string; default?: boolean }>
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
        ...(model.priceVariants?.length
            ? [
                  {
                      key: "pricing",
                      value: variantName,
                      options: [
                          { value: "", label: "Default" },
                          ...model.priceVariants.map(({ name, label }) => ({
                              value: name,
                              label,
                          })),
                      ],
                      onSelect: setVariantName,
                  },
              ]
            : []),
        ...[...adjustmentOptionGroups].map(([group, options]) => ({
            key: group,
            value: adjustmentOptions[group],
            options,
            onSelect: (value: string) =>
                setAdjustmentOptions((current) => ({
                    ...current,
                    [group]: value,
                })),
        })),
    ];

    return { prices, adjustments, dropdowns };
};

export const ModelPricingControls: FC<{
    model: ModelPrice;
    pricing: ModelPricingSelection;
    className?: string;
}> = ({ model, pricing, className }) => {
    if (!pricing.dropdowns.length) return null;

    return (
        <div className={cn("flex min-w-0 flex-wrap gap-1", className)}>
            {pricing.dropdowns.map((dropdown) => {
                const selected = dropdown.options.find(
                    ({ value }) => value === dropdown.value,
                );
                return (
                    <Dropdown
                        key={dropdown.key}
                        align="start"
                        className="w-max min-w-40 p-1"
                        trigger={(open) => (
                            <Button
                                type="button"
                                size="sm"
                                aria-label={`Pricing option for ${model.displayName ?? model.name}`}
                                className="max-w-52 justify-between gap-2 text-xs tabular-nums"
                            >
                                <span className="truncate">
                                    {selected?.label}
                                </span>
                                <ChevronIcon expanded={open} />
                            </Button>
                        )}
                    >
                        {(close) => (
                            <div role="menu">
                                {dropdown.options.map((option) => {
                                    const isSelected =
                                        option.value === dropdown.value;
                                    return (
                                        <DropdownItem
                                            key={option.value}
                                            role="menuitemradio"
                                            aria-checked={isSelected}
                                            onClick={() => {
                                                dropdown.onSelect(option.value);
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
                );
            })}
        </div>
    );
};

export const ModelPricingLedger: FC<{
    pricing: ModelPricingSelection;
    className?: string;
}> = ({ pricing, className }) => {
    if (!pricing.prices.length && !pricing.adjustments.length) return null;

    return (
        <div className={cn("flex min-w-0 flex-col gap-1", className)}>
            {pricing.prices.map((price) => {
                const displayedPrice = formatDisplayPrice(
                    price.price,
                    price.unit === "token",
                );
                const PriceIcon = PRICE_ICON[price.kind];
                return (
                    <div
                        key={`${price.direction}-${price.kind}-${price.unit}`}
                        className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-1.5 py-0.5"
                    >
                        <span className="flex items-center gap-1.5 text-xs text-theme-text-muted">
                            <PriceIcon className="h-3.5 w-3.5 shrink-0" />
                            {PRICE_LINE_LABELS[price.kind][price.direction]}
                        </span>
                        <span className="min-w-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-theme-text-strong">
                            {displayedPrice.value}{" "}
                            <span className="text-xs font-normal text-theme-text-muted">
                                {price.unit === "token"
                                    ? `/${displayedPrice.tokenScale} tokens`
                                    : PRICE_LEDGER_UNIT[price.unit]}
                            </span>
                        </span>
                    </div>
                );
            })}
            {pricing.adjustments.length > 0 && (
                <div className="mt-1 border-t border-dashed border-divider pt-1">
                    {pricing.adjustments.map((adjustment) => (
                        <div
                            key={adjustment.name}
                            className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-1.5 py-0.5"
                        >
                            <span className="text-xs text-theme-text-muted">
                                {adjustment.label}
                            </span>
                            <span className="min-w-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-theme-text-strong">
                                {formatDisplayPrice(adjustment.price).value}{" "}
                                <span className="text-xs font-normal text-theme-text-muted">
                                    /{formatAdjustmentUnit(adjustment)}
                                </span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
