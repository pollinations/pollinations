import type { FC } from "react";

export const PriceBadge: FC<{
    prices: (string | undefined)[];
    emoji: string;
    subEmojis: string[];
    perImage?: boolean;
    perToken?: boolean;
    perSecond?: boolean;
}> = ({ prices, emoji, subEmojis, perImage, perToken, perSecond }) => {
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

    // Tooltip text for pricing emojis
    const getTooltip = (emoji: string): string => {
        switch (emoji) {
            case "💬":
                return "Input Cost";
            case "💾":
                return "Cached Input Cost";
            case "🔊":
                return "Audio Cost";
            case "🖼️":
                return "Image Cost";
            case "🎬":
                return "Video Cost";
            default:
                return "";
        }
    };

    return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-gray-100 text-gray-700">
            <span title={getTooltip(emoji)} className="cursor-help">
                {emoji}
            </span>
            <span className="inline-flex items-center gap-1">
                {validPrices.map((price, j) => {
                    const subEmoji = subEmojis[j];
                    const subTooltip = subEmoji ? getTooltip(subEmoji) : "";
                    return (
                        <span key={j} className="inline-flex items-center gap-1">
                            {j > 0 && <span className="text-gray-400">|</span>}
                            {j > 0 && subEmojis[j] && (
                                <span
                                    title={subTooltip}
                                    className="cursor-help"
                                >
                                    {subEmojis[j]}
                                </span>
                            )}
                            <span>
                                {price}
                                {suffix}
                            </span>
                        </span>
                    );
                })}
            </span>
        </span>
    );
};
