// Shared package-owned text tones for signed analytical outcomes.

export function signedTone(value: number): string {
    if (value > 0) return "text-outcome-positive-text";
    if (value < 0) return "text-outcome-negative-text";
    return "text-theme-text-strong";
}

export function signedToneOrSoft(value: number | null): string {
    if (value == null) return "text-theme-text-soft";
    return signedTone(value);
}
