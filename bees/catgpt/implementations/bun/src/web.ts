import { routes } from "./agent.ts";

// Bun-specific. Run with `bun run src/web.ts`.
declare const Bun: any;

const port = Number(process.env.PORT ?? 8787);

Bun.serve({
    port,
    routes,
    fetch() {
        return new Response("not found", { status: 404 });
    },
});

console.log(`[bun] CatGPT listening on http://localhost:${port}`);
