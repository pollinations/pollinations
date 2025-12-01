import type { FC } from "react";

export const PriceBadge: FC<{ prices: (string | undefined)[], emoji: string, subEmojis: string[], perImage?: boolean, perToken?: boolean, perSecond?: boolean }> = ({ prices, emoji, subEmojis, perImage, perToken, perSecond }) => {
    const validPrices = prices.filter(p => p && p !== "—");
    if (validPrices.length === 0) return null;

    // Show suffix for per-image, per-second, or per-token pricing
    const suffix = perSecond ? '' : (perImage ? ' / image' : (perToken ? ' /M token' : ''));

    return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-100 text-gray-700">
            <span>{emoji}</span>
            <span className="inline-flex items-center gap-1">
                {validPrices.map((price, j) => (
                    <span key={j} className="inline-flex items-center gap-1">
                        {j > 0 && <span className="text-gray-400">|</span>}
                        {j > 0 && subEmojis[j] && <span>{subEmojis[j]}</span>}
                        <span>{price}{suffix}</span>
                    </span>
                ))}
            </span>
        </span>
    );
};
