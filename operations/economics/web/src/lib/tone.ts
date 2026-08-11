// Shared text tones for signed money/percent cells.

export function signedTone(value: number): string {
    return value >= 0 ? "text-intent-success-text" : "text-intent-danger-text";
}

export function signedToneOrSoft(value: number | null): string {
    if (value == null) return "text-theme-text-soft";
    return signedTone(value);
}

// Reconciliation match quality: ≥95% healthy, ≥80% suspect, below is broken.
export function usageMatchTone(value: number | null): string {
    if (value == null) return "text-theme-text-soft";
    if (value >= 95) return "text-intent-success-text";
    if (value >= 80) return "text-intent-warning-text";
    return "text-intent-danger-text";
}
