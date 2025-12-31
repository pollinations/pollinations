/**
 * Shared utility functions for Pollinations services
 * These are generic utilities that can be used across multiple services
 */

/**
 * Remove specified keys from an object
 * @example omit({ a: 1, b: 2, c: 3 }, 'b') // { a: 1, c: 3 }
 */
export function omit<T, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
    const result = { ...obj };
    keys.forEach((key) => delete result[key]);
    return result;
}

/**
 * Safely round a number to a specified precision, handling edge cases
 * @param amount - The number to round
 * @param precision - Number of decimal places (default: 6)
 * @returns Rounded number, or 0 if invalid
 * @example safeRound(1.23456789, 4) // 1.2346
 */
export function safeRound(amount: number, precision: number = 6): number {
    if (!Number.isFinite(amount) || Number.isNaN(amount)) {
        return 0;
    }
    // Handle very small amounts (avoid floating point issues)
    if (Math.abs(amount) < 10 ** -(precision + 2)) {
        return 0;
    }
    const factor = 10 ** precision;
    return Math.round(amount * factor) / factor;
}
