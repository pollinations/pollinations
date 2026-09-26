import { once } from "node:events";
import { serve } from "@hono/node-server";
import { createCaptureService, type ReviewCaseModule } from "./captures";
import { ADMIN_ORIGIN, ENTER_ORIGIN, RUNTIME_ORIGIN } from "./local-origins";
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
    const fetchRuntime = async (request: Request) => {
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
        port: Number(new URL(RUNTIME_ORIGIN).port),
    });
    const admin = serve({
        hostname: "127.0.0.1",
        port: Number(new URL(ADMIN_ORIGIN).port),
        fetch: async (request) => {
            const url = new URL(request.url);
            if (/^\/(?:auth|__flow)(?:\/|$)/.test(url.pathname))
                return fetchRuntime(request);
            if (!["GET", "HEAD"].includes(request.method))
                return new Response("Source files are read-only", {
                    status: 405,
                });
            const source = new URL(
                `${url.pathname}${url.search}`,
                ENTER_ORIGIN,
            );
            if (source.pathname === "/") source.pathname = "/flow-admin.html";
            const headers = new Headers(request.headers);
            headers.delete("cookie");
            headers.delete("authorization");
            headers.delete("host");
            return fetch(source, {
                method: request.method,
                headers,
                redirect: "manual",
            });
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
