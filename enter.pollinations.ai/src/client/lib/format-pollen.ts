export function toFinitePollen(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const numericValue =
        typeof value === "number" ? value : Number.parseFloat(String(value));
    return Number.isFinite(numericValue) ? numericValue : 0;
}

export function formatPollen(value: unknown): string {
    const safeValue = toFinitePollen(value);
    return safeValue.toFixed(safeValue > 0 && safeValue < 1 ? 3 : 2);
}
