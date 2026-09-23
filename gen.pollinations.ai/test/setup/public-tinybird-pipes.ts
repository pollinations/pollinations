// Catalog responses read model health and the balance preflight reads model
// stats from public Tinybird pipes. Production caches both (cf cacheTtl, KV),
// but tests ignore cf cache options and reset KV per test, so every call went
// to production Tinybird and slow responses timed out unrelated tests. Answer
// them as an empty feed, which the Worker already treats as "no data". Tests
// that assert on these requests stub fetch themselves and take precedence.
const PUBLIC_PIPES = new Set([
    "/v0/pipes/model_route_health.json",
    "/v0/pipes/public_model_stats.json",
]);

// Setup files run once per test file but globalThis persists, so wrap once.
const STUBBED = "__pollinationsPublicTinybirdPipesStubbed";
const state = globalThis as typeof globalThis & { [STUBBED]?: boolean };

if (!state[STUBBED]) {
    const networkFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (
            url.hostname === "api.europe-west2.gcp.tinybird.co" &&
            PUBLIC_PIPES.has(url.pathname)
        ) {
            return Response.json({ data: [] });
        }
        return networkFetch(input, init);
    };
    state[STUBBED] = true;
}

export {};
