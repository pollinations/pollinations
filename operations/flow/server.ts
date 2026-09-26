import { once } from "node:events";
import { serve } from "@hono/node-server";
import { createCaptureService, type ReviewCaseModule } from "./captures";
import { environmentScript } from "./flow-environment";
import { ADMIN_ORIGIN, ORIGINS, PORT, RUNTIME_ORIGIN } from "./local-origins";
import type { LoadReviewErrors } from "./review-requests";
import { bundleWorkers, startRuntime } from "./runtime.ts";
import { assetRequest } from "./source-assets";
import { readSourceInfo } from "./source-info";
import { buildSourceStyles } from "./source-styles";

export async function startServer(options: {
    loadReviewCases?: () => Promise<ReviewCaseModule>;
    loadReviewErrors: LoadReviewErrors;
    fetchAssets?: (request: Request) => Promise<Response>;
}) {
    let source = await readSourceInfo();
    const fetchAssets = options.fetchAssets ?? fetch;
    let scripts = await bundleWorkers();
    const runtime = await startRuntime({
        scripts,
        loadReviewErrors: options.loadReviewErrors,
    });
    let ready = Promise.resolve();
    const captures = options.loadReviewCases
        ? createCaptureService({
              loadCases: options.loadReviewCases,
              source: () => source,
              fetchAssets,
              loadRuntime: async () => (runtimeOptions) =>
                  startRuntime({
                      ...runtimeOptions,
                      scripts,
                      loadReviewErrors: options.loadReviewErrors,
                  }),
          })
        : undefined;
    const fetchRuntime = async (request: Request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/__flow/config.js")
            return environmentScript({ ...ORIGINS, source });
        if (pathname === "/__flow/source")
            return Response.json(source, {
                headers: { "Cache-Control": "no-store" },
            });
        try {
            await ready;
        } catch {
            return Response.json(
                {
                    error: "Flow source rebuild failed. Check the dev server.",
                },
                { status: 503 },
            );
        }
        return (await captures?.fetch(request)) ?? runtime.fetch(request);
    };
    const server = serve({
        fetch: fetchRuntime,
        hostname: "127.0.0.1",
        port: PORT + 1,
    });
    const admin = serve({
        hostname: process.env.FLOW_BIND_ADDRESS ?? "127.0.0.1",
        port: PORT + 2,
        fetch: async (request) => {
            const url = new URL(request.url);
            request = new Request(
                new URL(`${url.pathname}${url.search}`, ADMIN_ORIGIN),
                request,
            );
            if (/^\/(?:auth|__flow)(?:\/|$)/.test(url.pathname))
                return fetchRuntime(request);
            if (!["GET", "HEAD"].includes(request.method))
                return new Response("Source files are read-only", {
                    status: 405,
                });
            return fetchAssets(assetRequest(request, ADMIN_ORIGIN));
        },
    });
    try {
        await Promise.all([
            once(server, "listening"),
            once(admin, "listening"),
        ]);
    } catch (error) {
        server.close();
        admin.close();
        try {
            await captures?.close();
        } finally {
            await runtime.dispose();
        }
        throw error;
    }
    console.log(`Flow local Workers ready at ${RUNTIME_ORIGIN}`);
    console.log(`Flow Admin example ready at ${ADMIN_ORIGIN}`);
    return {
        fetch: fetchRuntime,
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
                    source = await readSourceInfo();
                });
            return ready;
        },
        async close() {
            try {
                try {
                    await Promise.all(
                        [server, admin].map(
                            (host) =>
                                new Promise<void>((resolve) =>
                                    host.close(() => resolve()),
                                ),
                        ),
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
