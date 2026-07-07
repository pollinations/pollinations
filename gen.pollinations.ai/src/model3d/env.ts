const model3dEnv = new Map<string, string>();

const MODEL3D_ENV_KEYS = [
    "FAL_KEY",
    "INFERENCEPORT_API_KEY",
] as const satisfies readonly (keyof CloudflareBindings)[];

export function syncModel3dEnvironment(env: CloudflareBindings): void {
    for (const key of MODEL3D_ENV_KEYS) {
        const value = env[key];
        if (typeof value !== "string") continue;
        model3dEnv.set(key, value);
    }
}

export function getModel3dEnv(key: string): string | undefined {
    return model3dEnv.get(key) || process.env[key];
}
