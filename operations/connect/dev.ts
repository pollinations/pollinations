import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import type { ReviewCaseModule } from "./captures";
import type { startRuntime } from "./runtime";
import { startServer } from "./server";

const vite = await createServer({
    configFile: fileURLToPath(
        new URL("./vite.live.config.ts", import.meta.url),
    ),
});
const here = fileURLToPath(new URL(".", import.meta.url));
const repository = path.resolve(here, "../..");
let runtime: Awaited<ReturnType<typeof startServer>>;
try {
    runtime = await startServer({
        loadCaptureRuntime: async () =>
            (await vite.ssrLoadModule(`${here}runtime.ts`))
                .startRuntime as typeof startRuntime,
        loadReviewCases: async () =>
            (await vite.ssrLoadModule(
                `${here}review-inventory.ts`,
            )) as ReviewCaseModule,
    });
} catch (error) {
    await vite.close();
    throw error;
}
const sources = [
    "enter.pollinations.ai/src",
    "enter.pollinations.ai/drizzle",
    "enter.pollinations.ai/frontend",
    "gen.pollinations.ai/src",
    "packages/ui/src",
    "packages/sdk/src",
    "packages/auth/src",
    "shared",
    "operations/connect",
].map((relative) => path.join(repository, relative));
vite.watcher.add(sources);
let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
vite.watcher.on("all", (event, filename) => {
    if (!["add", "change", "unlink"].includes(event)) return;
    const absolute = path.resolve(filename);
    if (!sources.some((source) => absolute.startsWith(`${source}/`))) return;
    if (
        /(?:^|\/)(?:node_modules|\.local|dist|dist-live)(?:\/|$)/.test(absolute)
    )
        return;
    if (!/\.(?:[cm]?[jt]sx?|css|html|svg|png|json|sql)$/.test(absolute)) return;
    clearTimeout(invalidateTimer);
    invalidateTimer = setTimeout(() => runtime.invalidatePreviews(), 200);
});
try {
    await vite.listen();
    console.log("Connect: http://localhost:4180/connect");
    console.log(
        "Prepare or reset the local account explicitly with: npm run reset",
    );
} catch (error) {
    try {
        await runtime.close();
    } finally {
        await vite.close();
    }
    throw error;
}
async function stop() {
    clearTimeout(invalidateTimer);
    try {
        await runtime.close();
    } finally {
        await vite.close();
    }
    process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
