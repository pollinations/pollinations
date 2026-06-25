import { Chip, cn } from "@pollinations/ui";
import type { FC } from "react";
import { PRICE_ICON, type PriceKind } from "./model-icons.tsx";

export type PriceBadgeConfig = {
    prices: (string | undefined)[];
    kind: PriceKind;
    subKinds: PriceKind[];
    perRequest?: boolean;
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
            badge.perRequest ? "gen" : "",
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
    perRequest,
    perToken,
    perSecond,
    className,
}) => {
    const validPrices = prices.filter((p): p is string =>
        Boolean(p && p !== "—"),
    );
    if (validPrices.length === 0) return null;

    // Compact suffix based on pricing type
    const suffix = perSecond
        ? "/sec"
        : perRequest
          ? "/gen"
          : perToken
            ? "/M"
            : "";

    // One compact pill: glyph(s) + value grouped so it reads as a single unit.
    return (
        <Chip
            intent="neutral"
            size="sm"
            className={cn("whitespace-nowrap tabular-nums", className)}
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
        </Chip>
    );
};
