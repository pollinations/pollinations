/**
 * Pollen Precision Utilities
 * 
 * Solves floating point precision errors by storing monetary values as integers.
 * 
 * THE PROBLEM:
 * - Storing money as REAL (float) causes precision errors: 0.1 + 0.2 = 0.30000000000000004
 * - Over time, rounding errors compound and accounting breaks
 * - Users can end up with $0.00000001 they can't spend
 * 
 * THE SOLUTION:
 * - Store as INTEGER in micro-pollen (1 pollen = 1,000,000 micro-pollen)
 * - Provides 6 decimal places of precision (more than enough for smallest price)
 * - All arithmetic is exact (no floating point errors)
 * - Example: 0.15 pollen -> 150,000 micro-pollen (integer)
 */

/** Scale factor: 1 pollen = 1,000,000 micro-pollen (6 decimal places) */
export const MICRO_POLLEN_SCALE = 1_000_000;

/**
 * Convert pollen (decimal) to micro-pollen (integer)
 * 
 * @example
 * toMicroPollen(0.15) // 150000
 * toMicroPollen(0.00000015) // 0.15 (fractional micro-pollen, rounds)
 */
export function toMicroPollen(pollen: number): number {
    return Math.round(pollen * MICRO_POLLEN_SCALE);
}

/**
 * Convert micro-pollen (integer) to pollen (decimal)
 * 
 * @example
 * fromMicroPollen(150000) // 0.15
 * fromMicroPollen(1) // 0.000001
 */
export function fromMicroPollen(microPollen: number): number {
    return microPollen / MICRO_POLLEN_SCALE;
}

/**
 * Format micro-pollen as human-readable pollen string
 * 
 * @example
 * formatPollen(150000) // "0.150000"
 * formatPollen(1) // "0.000001"
 */
export function formatPollen(microPollen: number, decimals: number = 6): string {
    return fromMicroPollen(microPollen).toFixed(decimals);
}
