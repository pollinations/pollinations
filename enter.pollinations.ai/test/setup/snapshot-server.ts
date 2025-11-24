import { serve } from "@hono/node-server";
import { Hono } from "hono";
import fs from "node:fs/promises";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { getLogger } from "@logtape/logtape";

const SNAPSHOTS_DIR = path.join(process.cwd(), "test", "mocks", "snapshots");

let server: ReturnType<typeof serve> | null = null;
const log = getLogger(["test", "mock", "vcr", "storage"]);

export async function setup({ provide }: TestProject) {
    await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });

    const vcrStorageServer = new Hono()
        .get("/:filename", async (c) => {
            try {
                const filename = c.req.param("filename");
                const filePath = path.join(SNAPSHOTS_DIR, filename);
                const content = await fs.readFile(filePath, "utf-8");
                return c.json(JSON.parse(content));
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                    return c.json({ error: "Snapshot not found" }, 404);
                }
                return c.json({ error: "Failed to read snapshot" }, 500);
            }
        })
        .put("/:filename", async (c) => {
            try {
                const filename = c.req.param("filename");
                const filePath = path.join(SNAPSHOTS_DIR, filename);
                const data = await c.req.json();
                await fs.writeFile(
                    filePath,
                    JSON.stringify(data, null, 2),
                    "utf-8",
                );
                return c.json({ success: true }, 200);
            } catch (error) {
                return c.json({ error: "Failed to write snapshot" }, 500);
            }
        });

    const port = 3210;
    server = serve({
        fetch: vcrStorageServer.fetch,
        port,
    });

    log.info(`VCR storage server started on http://localhost:${port}`);
    provide("snapshotServerUrl", `http://localhost:${port}`);
}

export async function teardown() {
    if (server) {
        log.info("Shutting down VCR storage server...");
        server.close();
        server = null;
    }
}

declare module "vitest" {
    export interface ProvidedContext {
        snapshotServerUrl: string;
    }
}
