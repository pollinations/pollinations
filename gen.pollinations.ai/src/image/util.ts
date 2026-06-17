export async function sleep(ms: number) {
    await new Promise<void>((resolve, _) => setTimeout(resolve, ms));
}

// Strip control characters while preserving valid Unicode characters.
export function sanitizeString(str: string) {
    if (!str) return str;
    // biome-ignore lint/suspicious: this is ok
    return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
}
