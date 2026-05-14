import type { FC } from "react";
import { cn } from "../../../util.ts";
import { Tooltip } from "../ui/tooltip.tsx";

const priceBadgeColors = {
    gray: "text-gray-700",
    purple: "text-purple-700",
    teal: "text-teal-700",
} as const;

const TOKEN_TYPE_LABELS: Record<string, string> = {
    "💬": "text",
    "🖼️": "image",
    "💾": "cached",
    "🎬": "video",
    "🎙️": "audio",
    "🔊": "audio",
};

const renderAlignedPrice = (price: string) => {
    const numericParts = price.match(/^(\d+)(?:\.(\d+))?$/);
    if (!numericParts) {
        return <span className="tabular-nums">{price}</span>;
    }

    const [, integerPart, fractionalPart] = numericParts;

    return (
        <span className="inline-flex items-baseline tabular-nums">
            <span className="inline-block min-w-[2ch] text-right md:min-w-[3ch]">
                {integerPart}
            </span>
            {fractionalPart !== undefined && (
                <>
                    <span>.</span>
                    <span>{fractionalPart}</span>
                </>
            )}
        </span>
    );
};

export type PriceBadgeConfig = {
    prices: (string | undefined)[];
    emoji: string;
    subEmojis: string[];
    perImage?: boolean;
    perToken?: boolean;
    perSecond?: boolean;
    color?: keyof typeof priceBadgeColors;
    className?: string;
};

export const groupPriceBadges = (
    badges: PriceBadgeConfig[],
): PriceBadgeConfig[] => {
    const grouped = new Map<string, PriceBadgeConfig>();

    for (const badge of badges) {
        const validPrices = badge.prices.filter((p): p is string =>
            Boolean(p && p !== "—"),
        );
        if (validPrices.length === 0) continue;

        const key = [
            validPrices[0],
            badge.perImage ? "img" : "",
            badge.perToken ? "token" : "",
            badge.perSecond ? "sec" : "",
            badge.color ?? "",
            badge.className ?? "",
        ].join("|");

        const existing = grouped.get(key);
        if (existing) {
            const nextSubEmojis = [
                ...existing.subEmojis,
                ...badge.subEmojis,
                badge.emoji,
            ].filter(Boolean);
            existing.subEmojis = [...new Set(nextSubEmojis)];
            continue;
        }

        grouped.set(key, {
            ...badge,
            prices: [validPrices[0]],
            subEmojis: [...new Set([...badge.subEmojis, badge.emoji])],
        });
    }

    return [...grouped.values()];
};

export const PriceBadge: FC<PriceBadgeConfig> = ({
    prices,
    emoji,
    subEmojis,
    perImage,
    perToken,
    perSecond,
    color = "gray",
    className,
}) => {
    const validPrices = prices.filter((p): p is string =>
        Boolean(p && p !== "—"),
    );
    if (validPrices.length === 0) return null;
    const tokenTypes = [
        ...new Set(
            subEmojis.map((item) => TOKEN_TYPE_LABELS[item]).filter(Boolean),
        ),
    ];
    const tokenTypeLabel =
        tokenTypes.length > 1
            ? `Token types: ${tokenTypes.join(", ")}`
            : tokenTypes.length === 1
              ? `Token type: ${tokenTypes[0]}`
              : undefined;

    // Show suffix based on pricing type
    const suffix = perSecond
        ? " /sec"
        : perImage
          ? " /img"
          : perToken
            ? " /M"
            : "";

    const badge = (
        <span
            className={cn(
                "inline-flex items-center gap-px px-2 py-0.5 text-xs whitespace-nowrap",
                priceBadgeColors[color],
                className,
            )}
        >
            <span className="inline-flex min-w-[1.65rem] items-center justify-end gap-0.5">
                {(subEmojis.length > 0 ? subEmojis : [emoji]).map((item) => (
                    <span key={item}>{item}</span>
                ))}
            </span>
            <span className="inline-flex items-baseline">
                {renderAlignedPrice(validPrices[0])}
                <span>{suffix}</span>
            </span>
        </span>
    );

    return tokenTypeLabel ? (
        <Tooltip content={tokenTypeLabel}>{badge}</Tooltip>
    ) : (
        badge
    );
};
