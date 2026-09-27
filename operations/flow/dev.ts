import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import type { ReviewCaseModule } from "./captures";
import { ENTER_ORIGIN } from "./local-origins";
import type { LoadReviewErrors } from "./review-requests";
import { startServer } from "./server";

const here = fileURLToPath(new URL(".", import.meta.url));
const repository = path.resolve(here, "../..");
const sources = [
    "enter.pollinations.ai/src",
    "enter.pollinations.ai/drizzle",
    "enter.pollinations.ai/wrangler.toml",
    "enter.pollinations.ai/frontend",
    "gen.pollinations.ai/src",
    "gen.pollinations.ai/wrangler.toml",
    "packages/ui/src",
    "packages/sdk/src",
    "packages/auth/src",
    "shared",
    "operations/flow",
].map((relative) => path.join(repository, relative));
let runtime: Awaited<ReturnType<typeof startServer>>;
const vite = await createServer({
    configFile: fileURLToPath(
        new URL("./vite.live.config.ts", import.meta.url),
    ),
    plugins: [
        {
            name: "flow-source-refresh",
            hotUpdate: {
                order: "post",
                async handler({ file, server }) {
                    if (
                        file.startsWith(
                            path.join(repository, "packages/ui/dist/"),
                        )
                    ) {
                        await runtime.waitUntilReady();
                        return;
                    }
                    if (
                        !sources.some(
                            (source) =>
                                file === source ||
                                file.startsWith(`${source}/`),
                        )
                    )
                        return;
                    if (
                        /(?:^|\/)(?:node_modules|\.local|dist|dist-live|test)(?:\/|$)/.test(
                            file,
                        )
                    )
                        return;
                    if (
                        !/\.(?:[cm]?[jt]sx?|css|html|svg|png|webp|woff2|md|json|sql|toml)$/.test(
                            file,
                        )
                    )
                        return;
                    if (this.environment.name === "client") {
                        server.environments.ssr.moduleGraph.invalidateAll();
                        await runtime.reload();
                        server.ws.send({
                            type: "custom",
                            event: "flow:source-refreshed",
                        });
                    }
                    // Let Vite update UI modules after the Workers and CSS are
                    // ready. React retains the review's screen/situation selection.
                    return undefined;
                },
            },
        },
    ],
});
try {
    runtime = await startServer({
        loadReviewErrors: () =>
            vite.ssrLoadModule(
                path.join(repository, "shared/error.ts"),
            ) as ReturnType<LoadReviewErrors>,
        loadReviewCases: async () =>
            (await vite.ssrLoadModule(
                `${here}review-inventory.ts`,
            )) as ReviewCaseModule,
    });
} catch (error) {
    await vite.close();
    throw error;
}
vite.watcher.add(sources);
try {
    await vite.listen();
    console.log(`Flow: ${ENTER_ORIGIN}/flow`);
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
    try {
        await runtime.close();
    } finally {
        await vite.close();
    }
    process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
