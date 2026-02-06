import type { FC } from "react";
import { cn } from "../../../util.ts";

const priceBadgeColors = {
    gray: "bg-gray-100 text-gray-700",
    purple: "bg-purple-200 text-purple-700",
    teal: "bg-teal-200 text-teal-700",
} as const;

export const PriceBadge: FC<{
    prices: (string | undefined)[];
    emoji: string;
    subEmojis: string[];
    perImage?: boolean;
    perToken?: boolean;
    perSecond?: boolean;
    color?: keyof typeof priceBadgeColors;
    className?: string;
}> = ({
    prices,
    emoji,
    subEmojis,
    perImage,
    perToken,
    perSecond,
    color = "gray",
    className,
}) => {
    const validPrices = prices.filter((p) => p && p !== "—");
    if (validPrices.length === 0) return null;

    // Show suffix based on pricing type
    const suffix = perSecond
        ? " /sec"
        : perImage
          ? " /img"
          : perToken
            ? " /M"
            : "";

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap",
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
};
