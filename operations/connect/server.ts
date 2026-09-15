import { once } from "node:events";
import { serve } from "@hono/node-server";
import { createCaptureService, type ReviewCaseModule } from "./captures";
import type { LoadReviewErrors } from "./review-requests";
import { bundleWorkers, startRuntime } from "./runtime.ts";
import { buildSourceStyles } from "./source-styles";

export async function startServer(options: {
    loadReviewCases?: () => Promise<ReviewCaseModule>;
    loadReviewErrors: LoadReviewErrors;
}) {
    let scripts = await bundleWorkers();
    const runtime = await startRuntime({
        scripts,
        loadReviewErrors: options.loadReviewErrors,
    });
    let ready = Promise.resolve();
    const captures = options.loadReviewCases
        ? createCaptureService({
              loadCases: options.loadReviewCases,
              loadRuntime: async () => (runtimeOptions) =>
                  startRuntime({
                      ...runtimeOptions,
                      scripts,
                      loadReviewErrors: options.loadReviewErrors,
                  }),
          })
        : undefined;
    const server = serve({
        fetch: async (request) => {
            try {
                await ready;
            } catch {
                return Response.json(
                    {
                        error: "Connect source rebuild failed. Check the dev server.",
                    },
                    { status: 503 },
                );
            }
            return (await captures?.fetch(request)) ?? runtime.fetch(request);
        },
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
        waitUntilReady: () => ready,
        reload() {
            captures?.invalidate();
            ready = ready
                .catch(() => {})
                .then(async () => {
                    const [next] = await Promise.all([
                        bundleWorkers(),
                        buildSourceStyles(),
                    ]);
                    await runtime.reload(next);
                    scripts = next;
                });
            return ready;
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
                await ready.catch(() => {});
                await runtime.dispose();
            }
        },
    };
}
