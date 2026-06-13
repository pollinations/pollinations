import { serve } from "@hono/node-server";
import app from "./agent.ts";

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[hono] CatGPT listening on http://localhost:${info.port}`);
});
