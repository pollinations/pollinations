const imageEnv = new Map<string, string>();

export function syncImageEnv(
    env: CloudflareBindings,
    keys: readonly (keyof CloudflareBindings)[],
): void {
    for (const key of keys) {
        const value = env[key];
        if (typeof value !== "string") continue;
        imageEnv.set(key, value);
        process.env[key] = value;
    }
}

export function getImageEnv(key: string): string | undefined {
    return imageEnv.get(key) || process.env[key];
}
