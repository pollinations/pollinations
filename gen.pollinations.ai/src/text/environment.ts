const TEXT_ENV_KEYS = [
    "AI_GATEWAY_API_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_REGION",
    "AWS_SECRET_ACCESS_KEY",
    "AZURE_MYCELI_PROD_API_KEY",
    "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
    "DASHSCOPE_API_KEY",
    "DEEPINFRA_API_KEY",
    "FIREWORKS_NEO_API_KEY",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PRIVATE_KEY_ID",
    "GOOGLE_PROJECT_ID",
    "OPENROUTER_API_KEY",
    "OVHCLOUD_API_KEY",
    "PERPLEXITY_API_KEY",
    "PORTKEY_GATEWAY_URL",
] as const satisfies readonly (keyof CloudflareBindings)[];

export function syncTextEnvironment(env: CloudflareBindings): void {
    // Text provider config still reads process.env. In Workers all bindings are
    // stable per deployment, so copying known string bindings before generation
    // is deterministic across concurrent requests in the same isolate.
    for (const key of TEXT_ENV_KEYS) {
        const value = env[key];
        if (typeof value === "string") {
            process.env[key] = value;
        }
    }
}
