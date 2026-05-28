/**
 * Price formatting utilities
 */

export const formatPricePer1M = (price: number): string => {
    const per1M = Number((price * 1000000).toPrecision(15));
    // toFixed(2) loses precision below 1¢ (e.g. 0.015 → "0.01" via IEEE 754).
    // Pick decimals dynamically: enough to show meaningful change at the cent
    // tier (most prices), more for sub-cent rates like cached-token pricing.
    let decimals: number;
    if (per1M >= 1) decimals = 2;
    else if (per1M >= 0.1) decimals = 3;
    else if (per1M >= 0.01) decimals = 4;
    else decimals = 5;
    const formatted = per1M.toFixed(decimals);
    // Remove trailing zeros but keep at least .0 for whole numbers
    const result = formatted.replace(/0+$/, "");
    return result.endsWith(".") ? result + "0" : result;
};

export const formatPrice = (
    price: number | undefined,
    formatter: (price: number) => string,
): string | undefined => {
    if (price === undefined) return undefined;
    return formatter(price);
};

export const formatPricePerImage = (price: number): string => {
    let formatted: string;
    if (price < 0.001) {
        formatted = price.toFixed(6);
    } else if (price < 0.01) {
        formatted = price.toFixed(4);
    } else if (price < 1) {
        formatted = price.toFixed(3);
    } else {
        formatted = price.toFixed(2);
    }

    // Remove trailing zeros but keep at least .0 for whole numbers
    const result = formatted.replace(/0+$/, "");
    return result.endsWith(".") ? result + "0" : result;
};
