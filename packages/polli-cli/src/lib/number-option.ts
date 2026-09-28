import { fail } from "./output.js";

export function numberOption(
    flag: string,
    value: string,
    min: number,
    max: number,
    integer = false,
): number {
    const parsed = Number(value);
    if (
        !value.trim() ||
        !Number.isFinite(parsed) ||
        (integer && !Number.isInteger(parsed)) ||
        parsed < min ||
        parsed > max
    ) {
        fail(
            `${flag} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}`,
        );
    }
    return parsed;
}
