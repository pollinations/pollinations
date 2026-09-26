import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const pages: Record<string, string> = {
    "/flow": "operations/flow/flow-flows.html",
    "/flow-screen.html": "operations/flow/flow-screen.html",
    "/flow-example.html": "operations/flow/flow-example.html",
    "/flow-admin.html": "operations/flow/flow-admin.html",
};

export function createBuiltPages(directory: string) {
    const app = new Hono();
    app.on(
        ["GET", "HEAD"],
        "*",
        serveStatic({
            root: path.relative(process.cwd(), directory),
            rewriteRequestPath: (pathname) =>
                pages[pathname] ??
                (path.extname(pathname)
                    ? pathname
                    : "enter.pollinations.ai/frontend/index.html"),
            onFound: (_path, context) => {
                context.header("Cache-Control", "no-cache");
            },
        }),
    );
    app.all("*", (context) =>
        ["GET", "HEAD"].includes(context.req.method)
            ? context.notFound()
            : context.text("Method not allowed", 405),
    );
    return app;
}
