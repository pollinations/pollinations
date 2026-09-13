import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { createCaptureService, type ReviewCaseModule } from "./captures";
import { startRuntime } from "./runtime.ts";

export async function startServer(
    options: {
        loadReviewCases?: () => Promise<ReviewCaseModule>;
        loadCaptureRuntime?: () => Promise<typeof startRuntime>;
    } = {},
) {
    const runtime = await startRuntime();
    const captures = options.loadReviewCases
        ? createCaptureService({
              loadCases: options.loadReviewCases,
              loadRuntime:
                  options.loadCaptureRuntime ?? (async () => startRuntime),
          })
        : undefined;
    const server = serve({
        fetch: async (request) =>
            (await captures?.fetch(request)) ?? runtime.fetch(request),
        hostname: "127.0.0.1",
        port: 4181,
    });
    try {
        await once(server, "listening");
    } catch (error) {
        try {
            await captures?.close();
        } finally {
            await runtime.dispose();
        }
        throw error;
    }
    console.log("Connect local Workers ready at http://localhost:4181");
    return {
        invalidatePreviews() {
            captures?.invalidate();
        },
        async close() {
            try {
                try {
                    await new Promise<void>((resolve) =>
                        server.close(() => resolve()),
                    );
                } finally {
                    await captures?.close();
                }
            } finally {
                await runtime.dispose();
            }
        },
    };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    const server = await startServer();
    const stop = async () => {
        await server.close();
        process.exit(0);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
}
