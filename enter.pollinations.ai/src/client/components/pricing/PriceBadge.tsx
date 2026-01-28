import type { FC } from "react";

export const PriceBadge: FC<{
    prices: (string | undefined)[];
    emoji: string;
    subEmojis: string[];
    perImage?: boolean;
    perToken?: boolean;
    perSecond?: boolean;
    className?: string;
}> = ({
    prices,
    emoji,
    subEmojis,
    perImage,
    perToken,
    perSecond,
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
            className={
                className ||
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-100 text-gray-700"
            }
        >
            <span>{subEmojis[0] || emoji}</span>
            <span>
                {validPrices[0]}
                {suffix}
            </span>
        </span>
    );
};
