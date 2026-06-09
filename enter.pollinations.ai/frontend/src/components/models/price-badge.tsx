import { cn, Tooltip } from "@pollinations/ui";
import type { FC } from "react";
import { PRICE_ICON, type PriceKind } from "./model-icons.tsx";

const TOKEN_TYPE_LABELS: Record<PriceKind, string> = {
    text: "text",
    image: "image",
    cached: "cached",
    video: "video",
    audioIn: "audio",
    audioOut: "audio",
};

export type PriceBadgeConfig = {
    prices: (string | undefined)[];
    kind: PriceKind;
    subKinds: PriceKind[];
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
            const nextSubKinds = [
                ...existing.subKinds,
                ...badge.subKinds,
                badge.kind,
            ];
            existing.subKinds = [...new Set(nextSubKinds)];
            continue;
        }

        grouped.set(key, {
            ...badge,
            prices: [validPrices[0]],
            subKinds: [...new Set([...badge.subKinds, badge.kind])],
        });
    }

    return [...grouped.values()];
};

export const PriceBadge: FC<PriceBadgeConfig> = ({
    prices,
    kind,
    subKinds,
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
        ...new Set(subKinds.map((item) => TOKEN_TYPE_LABELS[item])),
    ];
    const tokenTypeLabel =
        tokenTypes.length > 1
            ? `Token types: ${tokenTypes.join(", ")}`
            : tokenTypes.length === 1
              ? `Token type: ${tokenTypes[0]}`
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
                {(subKinds.length > 0 ? subKinds : [kind]).map((item) => {
                    const Icon = PRICE_ICON[item];
                    return <Icon key={item} className="h-3.5 w-3.5" />;
                })}
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
