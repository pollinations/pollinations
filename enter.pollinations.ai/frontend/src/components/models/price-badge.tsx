import { Chip, Tooltip } from "@pollinations/ui";
import type { FC } from "react";
import { PRICE_ICON } from "./model-icons.tsx";
import type {
    ModelPrice,
    ModelPriceLine,
    ModelPriceVariant,
    PriceDirection,
    PriceKind,
} from "./types.ts";

const TOKEN_TYPE_LABELS: Record<PriceKind, string> = {
    text: "text",
    document: "document",
    image: "image",
    "3d": "3D model",
    cached: "cached",
    cacheWrite: "cache write",
    reasoning: "reasoning",
    video: "video",
    audioIn: "audio",
    audioOut: "audio",
};

const PRICE_UNIT_SUFFIX: Record<ModelPriceLine["unit"], string> = {
    token: "/M",
    second: "/sec",
    request: "/gen",
    page: "/page",
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
    const tokenTypes = [
        ...new Set(subKinds.map((item) => TOKEN_TYPE_LABELS[item])),
    ];
    const typeLabel =
        tokenTypes.length > 1
            ? `Token types: ${tokenTypes.join(", ")}`
            : `${unit === "page" ? "Billing" : "Token"} type: ${tokenTypes[0]}`;

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
                {price}
                {PRICE_UNIT_SUFFIX[unit]}
            </span>
        </Chip>
    );

    return typeLabel ? <Tooltip content={typeLabel}>{badge}</Tooltip> : badge;
};

export const PriceVariantDetails: FC<{
    variants: ModelPriceVariant[];
}> = ({ variants }) => (
    <div className="flex max-w-[360px] flex-col gap-3 text-left">
        {variants.map((variant) => (
            <div key={variant.name} className="flex flex-col gap-1.5">
                <span className="font-medium text-theme-text-strong">
                    {variant.label}
                </span>
                <span className="text-xs leading-relaxed text-theme-text-muted">
                    {variant.description}
                </span>
                <PriceBadgeList
                    badges={groupPriceBadges(variant.prices)}
                    className="flex flex-wrap gap-1"
                />
            </div>
        ))}
    </div>
);

export const PriceVariantDisclosure: FC<{
    variants?: ModelPriceVariant[];
}> = ({ variants }) => {
    if (!variants?.length) return null;

    return (
        <Tooltip content={<PriceVariantDetails variants={variants} />}>
            <Chip intent="neutral" size="sm" className="whitespace-nowrap">
                Tiered pricing
            </Chip>
        </Tooltip>
    );
};
