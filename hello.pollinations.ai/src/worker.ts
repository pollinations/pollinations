/**
 * Worker entry point for hello.pollinations.ai
 * Serves static assets only - API calls go directly to gen.pollinations.ai from frontend
 */

interface Env {
    ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        return env.ASSETS.fetch(request);
    },
};
