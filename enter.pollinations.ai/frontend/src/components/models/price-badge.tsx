import { cn, Tooltip } from "@pollinations/ui";
import type { FC } from "react";

const TOKEN_TYPE_LABELS: Record<string, string> = {
    "💬": "text",
    "🖼️": "image",
    "💾": "cached",
    "🎬": "video",
    "🎙️": "audio",
    "🔊": "audio",
};

export type PriceBadgeConfig = {
    prices: (string | undefined)[];
    emoji: string;
    subEmojis: string[];
    perImage?: boolean;
    perToken?: boolean;
    perSecond?: boolean;
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
            ? `${subEmojis.join(" ")} Token types: ${tokenTypes.join(", ")}`
            : tokenTypes.length === 1
              ? `${subEmojis[0] ?? "🏷️"} Token type: ${tokenTypes[0]}`
              : undefined;

    // Compact suffix based on pricing type
    const suffix = perSecond
        ? "/sec"
        : perImage
          ? "/img"
          : perToken
            ? "/M"
            : "";

    // One compact pill: emoji(s) + value grouped so it reads as a single unit.
    const badge = (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-md bg-ink-100/80 px-1.5 py-0.5 text-xs whitespace-nowrap tabular-nums text-ink-900",
                className,
            )}
        >
            <span className="inline-flex items-center gap-0.5">
                {(subEmojis.length > 0 ? subEmojis : [emoji]).map((item) => (
                    <span key={item}>{item}</span>
                ))}
            </span>
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
