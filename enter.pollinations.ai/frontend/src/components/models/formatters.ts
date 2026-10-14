/**
 * Price formatting utilities
 */

export const formatPricePer1M = (price: number): string =>
    formatPriceFlat(Number((price * 1_000_000).toPrecision(15)));

const displayPriceNumber = new Intl.NumberFormat("en", {
    maximumFractionDigits: 4,
});
const smallDisplayPriceNumber = new Intl.NumberFormat("en", {
    maximumSignificantDigits: 6,
});

export const formatDisplayPrice = (
    price: string,
    tokenPrice = false,
): { value: string; tokenScale: "K" | "M" } => {
    const numericPrice = Number(price);
    const tokenScale = tokenPrice && numericPrice >= 100 ? "K" : "M";
    const scaledPrice = tokenScale === "K" ? numericPrice / 1000 : numericPrice;

    return {
        value: Number.isFinite(scaledPrice)
            ? (Math.abs(scaledPrice) < 0.001
                  ? smallDisplayPriceNumber
                  : displayPriceNumber
              ).format(scaledPrice)
            : price,
        tokenScale,
    };
};

// Preserve small rates through catalog conversion; the ledger handles compact
// display. Fixed decimal places can turn a valid paid rate into zero.
export const formatPriceFlat = (price: number): string => {
    const value = Number(price.toPrecision(12)).toString();
    return Number.isInteger(price) ? `${value}.0` : value;
};
