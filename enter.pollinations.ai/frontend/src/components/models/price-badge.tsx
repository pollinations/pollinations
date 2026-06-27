import { Chip, Tooltip } from "@pollinations/ui";
import type { FC } from "react";
import { PRICE_ICON } from "./model-icons.tsx";
import type {
    ModelPrice,
    ModelPriceLine,
    PriceDirection,
    PriceKind,
} from "./types.ts";

const TOKEN_TYPE_LABELS: Record<PriceKind, string> = {
    text: "text",
    image: "image",
    cached: "cached",
    video: "video",
    audioIn: "audio",
    audioOut: "audio",
};

const PRICE_UNIT_SUFFIX: Record<ModelPriceLine["unit"], string> = {
    token: "/M",
    second: "/sec",
    request: "/gen",
};

type PriceBadgeConfig = Omit<ModelPriceLine, "direction"> & {
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

const PriceBadge: FC<PriceBadgeConfig> = ({ price, unit, subKinds }) => {
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
                {price}
                {PRICE_UNIT_SUFFIX[unit]}
            </span>
        </Chip>
    );

    return tokenTypeLabel ? (
        <Tooltip content={tokenTypeLabel}>{badge}</Tooltip>
    ) : (
        badge
    );
};
