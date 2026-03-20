import type { FC } from "react";
import { cn } from "../../../util.ts";

const priceBadgeColors = {
    gray: "text-gray-700",
    purple: "text-purple-700",
    teal: "text-teal-700",
} as const;

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

    return (
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
};
