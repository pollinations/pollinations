import { route } from "./agent.ts";

// Deno-specific. Run with `deno run --allow-net --allow-env src/web.ts`.
declare const Deno: {
    serve: (
        opts: { port: number; hostname?: string },
        handler: (req: Request) => Response | Promise<Response>,
    ) => unknown;
    env: { get(key: string): string | undefined };
};

const port = Number(Deno.env.get("PORT") ?? 8787);

Deno.serve({ port }, route);

console.log(`[deno] CatGPT listening on http://localhost:${port}`);
