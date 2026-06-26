import { Chip, cn, Tooltip } from "@pollinations/ui";
import type { FC } from "react";
import { PRICE_ICON, type PriceKind } from "./model-icons.tsx";
import type { ModelPrice } from "./types.ts";

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
    perRequest?: boolean;
    perToken?: boolean;
    perSecond?: boolean;
    className?: string;
};

export type PriceDirection = "input" | "output";

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

export const getModelPriceBadges = (
    model: ModelPrice,
    direction: PriceDirection,
): PriceBadgeConfig[] =>
    groupPriceBadges(
        direction === "input"
            ? [
                  {
                      prices: [model.promptTextPrice],
                      kind: "text",
                      subKinds: ["text"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.promptCachedPrice],
                      kind: "cached",
                      subKinds: ["cached"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.promptAudioPrice],
                      kind: "audioIn",
                      subKinds: ["audioIn"],
                      perToken: model.perToken,
                      perRequest: model.perRequest,
                  },
                  {
                      prices: [model.promptImagePrice],
                      kind: "image",
                      subKinds: ["image"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.promptVideoPrice],
                      kind: "video",
                      subKinds: ["video"],
                      perToken: model.perToken,
                  },
              ]
            : [
                  {
                      prices: [model.completionTextPrice],
                      kind: "text",
                      subKinds: ["text"],
                      perToken: model.perToken,
                  },
                  {
                      prices: [model.completionAudioPrice],
                      kind: "audioOut",
                      subKinds: ["audioOut"],
                      perToken: model.perToken,
                      perRequest: model.perRequest,
                  },
                  {
                      prices: [model.perSecondPrice],
                      kind: model.type === "audio" ? "audioOut" : "video",
                      subKinds: [model.type === "audio" ? "audioOut" : "video"],
                      perSecond: true,
                  },
                  {
                      prices: [model.perAudioSecondPrice],
                      kind: "audioOut",
                      subKinds: ["audioOut"],
                      perSecond: true,
                  },
                  {
                      prices: [model.perTokenPrice],
                      kind: "video",
                      subKinds: ["video"],
                      perToken: true,
                  },
                  {
                      prices: [model.perImagePrice],
                      kind: "image",
                      subKinds: ["image"],
                      perRequest: true,
                  },
                  {
                      prices: [model.completionImagePrice],
                      kind: "image",
                      subKinds: ["image"],
                      perToken: model.perToken,
                  },
              ],
    );

const getPriceBadgeKey = (badge: PriceBadgeConfig): string =>
    [
        badge.subKinds.join(""),
        badge.prices[0],
        badge.perToken ? "token" : "",
        badge.perRequest ? "gen" : "",
        badge.perSecond ? "sec" : "",
    ].join("-");

type PriceBadgeListProps = {
    badges: PriceBadgeConfig[];
    className?: string;
};

export const PriceBadgeList: FC<PriceBadgeListProps> = ({
    badges,
    className,
}) => (
    <div className={className}>
        {badges.map((badge) => (
            <PriceBadge key={getPriceBadgeKey(badge)} {...badge} />
        ))}
    </div>
);

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
        : perRequest
          ? "/gen"
          : perToken
            ? "/M"
            : "";

    // One compact pill: emoji(s) + value grouped so it reads as a single unit.
    const badge = (
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

    return tokenTypeLabel ? (
        <Tooltip content={tokenTypeLabel}>{badge}</Tooltip>
    ) : (
        badge
    );
};
