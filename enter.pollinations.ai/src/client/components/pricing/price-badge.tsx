import type { FC } from "react";
import { cn } from "../../../util.ts";
import { Tooltip } from "./Tooltip.tsx";

const priceBadgeColors = {
    gray: "text-gray-700",
    purple: "text-purple-700",
    teal: "text-teal-700",
} as const;

const TOKEN_TYPE_LABELS: Record<string, string> = {
    "💬": "Token type: text",
    "🖼️": "Token type: image",
    "💾": "Token type: cached",
    "🎬": "Token type: video",
    "🎙️": "Token type: audio",
    "🔊": "Token type: audio",
};

export const PriceBadge: FC<{
    prices: (string | undefined)[];
    emoji: string;
    subEmojis: string[];
    perImage?: boolean;
    perToken?: boolean;
    perSecond?: boolean;
    perKChar?: boolean;
    color?: keyof typeof priceBadgeColors;
    className?: string;
}> = ({
    prices,
    emoji,
    subEmojis,
    perImage,
    perToken,
    perSecond,
    perKChar,
    color = "gray",
    className,
}) => {
    const validPrices = prices.filter((p) => p && p !== "—");
    if (validPrices.length === 0) return null;
    const tokenTypeLabel = TOKEN_TYPE_LABELS[subEmojis[0] || emoji];

    // Show suffix based on pricing type
    const suffix = perSecond
        ? " /sec"
        : perImage
          ? " /img"
          : perKChar
            ? " /1K chars"
            : perToken
              ? " /M"
              : "";

    const badge = (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs whitespace-nowrap",
                priceBadgeColors[color],
                className,
            )}
        >
            <span>{subEmojis[0] || emoji}</span>
            <span>
                {validPrices[0]}
                {suffix}
            </span>
        </span>
    );

    return tokenTypeLabel ? (
        <Tooltip content={tokenTypeLabel}>{badge}</Tooltip>
    ) : (
        badge
    );
};
