/**
 * Price formatting utilities
 */

export const formatPricePer1M = (price: number): string => {
    const per1M = price * 1000000;
    const formatted = (Math.ceil(per1M * 100) / 100).toFixed(2);
    // Remove trailing zeros but keep at least .0 for whole numbers
    const result = formatted.replace(/0+$/, "");
    return result.endsWith(".") ? `${result}0` : result;
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
    return result.endsWith(".") ? `${result}0` : result;
};
