import { env, SELF } from "cloudflare:test";
import { afterEach, expect, test } from "vitest";

// Mirrors gen.pollinations.ai/wrangler.toml [env.test.vars].
const GPU_TOKEN = "not-a-secret-workers-test-only";

const CLEANUP_PREFIXES = [
    "image:server:test:",
    "image:latency:test:",
];

afterEach(async () => {
    for (const prefix of CLEANUP_PREFIXES) {
        let cursor: string | undefined;
        do {
            const listed = await env.KV.list({ prefix });
            await Promise.all(
                listed.keys.map((k) => env.KV.delete(k.name)),
            );
            cursor = listed.list_complete ? undefined : listed.cursor;
        } while (cursor);
    }
});

test("GET /register refuses to list the GPU worker pool without the backend token", async () => {
    const response = await SELF.fetch("https://gen.pollinations.ai/register");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
        success: false,
        message: "Unauthorized",
    });
});

test("GET /register lists the pool for a backend token holder", async () => {
    const registered = await SELF.fetch(
        "https://gen.pollinations.ai/register?url=https://gpu-listing-auth.example:8000&type=flux",
        { headers: { "x-backend-token": GPU_TOKEN } },
    );
    expect(registered.status).toBe(200);
    expect(await registered.json()).toEqual({
        success: true,
        message: "Server registered successfully",
    });

    const listed = await SELF.fetch("https://gen.pollinations.ai/register", {
        headers: { "x-backend-token": GPU_TOKEN },
    });
    expect(listed.status).toBe(200);
    const entries = (await listed.json()) as Array<{
        type: string;
        url: string;
    }>;
    expect(entries).toContainEqual(
        expect.objectContaining({
            type: "flux",
            url: "https://gpu-listing-auth.example:8000",
        }),
    );
});
