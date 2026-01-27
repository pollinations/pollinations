import type { FC } from "react";

export const PriceBadge: FC<{
    prices: (string | undefined)[];
    emoji: string;
    subEmojis: string[];
    perImage?: boolean;
    perToken?: boolean;
    perSecond?: boolean;
    className?: string;
}> = ({ prices, emoji, subEmojis, perImage, perToken, perSecond, className }) => {
    const validPrices = prices.filter((p) => p && p !== "—");
    if (validPrices.length === 0) return null;

    // Show suffix based on pricing type
    const suffix = perSecond
        ? " /sec"
        : perImage
          ? " /image"
          : perToken
            ? " /M"
            : "";

    return (
        <span className={className || "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-100 text-gray-700"}>
            <span>{emoji}</span>
            <span className="inline-flex items-center gap-1">
                {validPrices.map((price, j) => (
                    <span key={j} className="inline-flex items-center gap-1">
                        {j > 0 && <span className="text-gray-400">|</span>}
                        {j > 0 && subEmojis[j] && <span>{subEmojis[j]}</span>}
                        <span>
                            {price}
                            {suffix}
                        </span>
                    </span>
                ))}
            </span>
        </span>
    );
};
