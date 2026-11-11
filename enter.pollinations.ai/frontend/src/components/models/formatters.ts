/**
 * Price formatting utilities
 */

import type { PriceUnit } from "./types.ts";

export const formatPricePer1M = (price: number): string =>
    formatPriceFlat(Number((price * 1_000_000).toPrecision(15)));

const displayPriceNumber = new Intl.NumberFormat("en", {
    maximumFractionDigits: 4,
});
const smallDisplayPriceNumber = new Intl.NumberFormat("en", {
    maximumSignificantDigits: 6,
});

const PRICE_UNIT_SUFFIX: Record<PriceUnit, string> = {
    token: "/M",
    second: "/sec",
    request: "/gen",
    megapixel: "/MP",
    character: "/K chars",
    byte: "/K bytes",
    image: "/image",
};

export const formatDisplayPrice = (
    price: string,
    unit: PriceUnit = "request",
    audio = false,
): { value: string; suffix: string } => {
    const numericPrice = Number(price);
    const perThousand = unit === "token" && numericPrice >= 100;
    const perHour = unit === "second" && audio && numericPrice < 0.01;
    const scaledPrice = perHour
        ? numericPrice * 3600
        : perThousand
          ? numericPrice / 1000
          : numericPrice;

    return {
        value: Number.isFinite(scaledPrice)
            ? (Math.abs(scaledPrice) < 0.001
                  ? smallDisplayPriceNumber
                  : displayPriceNumber
              ).format(scaledPrice)
            : price,
        suffix: perHour ? "/hr" : perThousand ? "/K" : PRICE_UNIT_SUFFIX[unit],
    };
};

// Preserve small rates through catalog conversion; the ledger handles compact
// display. Fixed decimal places can turn a valid paid rate into zero.
export const formatPriceFlat = (price: number): string => {
    const value = Number(price.toPrecision(12)).toString();
    return Number.isInteger(price) ? `${value}.0` : value;
};
