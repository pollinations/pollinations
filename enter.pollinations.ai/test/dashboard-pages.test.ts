import { createExecutionContext, env } from "cloudflare:test";
import { expect, test } from "vitest";
import worker from "../src/index.ts";

// The asset layer answers unknown paths with the dashboard shell (SPA fallback).
const ASSETS = {
    fetch: async (request: Request) =>
        new URL(request.url).pathname === "/robots.txt"
            ? new Response("User-agent: *", {
                  headers: { "content-type": "text/plain" },
              })
            : new Response("<!doctype html>", {
                  headers: { "content-type": "text/html" },
              }),
};

async function get(path: string) {
    return worker.fetch(
        new Request(`https://enter.pollinations.ai${path}`),
        { ...env, ASSETS } as unknown as CloudflareBindings,
        createExecutionContext(),
    );
}

test("dashboard pages and files load, unknown paths are real 404s", async () => {
    for (const page of ["/", "/my-apps", "/keys/", "/Models"]) {
        expect((await get(page)).status, page).toBe(200);
    }
    expect((await get("/robots.txt")).status).toBe(200);
    for (const missing of ["/auth.md", "/llms-full.txt", "/no-such-page"]) {
        const response = await get(missing);
        expect(response.status, missing).toBe(404);
        expect(response.headers.get("content-type")).toContain(
            "application/json",
        );
    }
});
