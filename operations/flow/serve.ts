import { once } from "node:events";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { ENTER_ORIGIN, PORT } from "./local-origins";
import { startServer } from "./server";
import { createBuiltPages } from "./static-pages";

const directory = fileURLToPath(new URL("./dist-live/", import.meta.url));
await access(`${directory}operations/flow/flow-flows.html`).catch(() => {
    throw new Error("Run npm run build --workspace=pollinations-flow first");
});
const pages = createBuiltPages(directory);
const runtime = await startServer({
    loadReviewCases: () => import("./review-inventory"),
    loadReviewErrors: () => import("../../shared/error"),
    fetchAssets: (request) => Promise.resolve(pages.fetch(request)),
});
const server = serve({
    hostname: process.env.FLOW_BIND_ADDRESS ?? "127.0.0.1",
    port: PORT,
    fetch: (request) => {
        const url = new URL(request.url);
        request = new Request(
            new URL(`${url.pathname}${url.search}`, ENTER_ORIGIN),
            request,
        );
        return /^\/(?:__flow|api|gen|auth|\.well-known)\//.test(url.pathname)
            ? runtime.fetch(request)
            : pages.fetch(request);
    },
});
try {
    await once(server, "listening");
    console.log(`Flow built pages: ${ENTER_ORIGIN}/flow`);
} catch (error) {
    await runtime.close();
    throw error;
}
async function stop() {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await runtime.close();
    process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
