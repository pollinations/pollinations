export function formatPollen(value: number): string {
    return value.toFixed(value > 0 && value < 1 ? 3 : 2);
}
