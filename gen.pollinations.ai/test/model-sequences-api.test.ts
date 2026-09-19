import { createExecutionContext, env } from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { session as sessionTable } from "@shared/db/better-auth.ts";
import { handleError } from "@shared/error.ts";
import { createTestUser } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "@/env.ts";

const db = drizzle(env.DB);

const testLog = { getChild: () => testLog } as unknown as Logger;

const PRIMARY = "openai/gpt-5.4";
const FALLBACK = "openai/gpt-5.4-nano";
const PAID_ONLY_MODEL = "mistralai/mistral-small-3.2";
const IMAGE_MODEL = "tongyi-mai/z-image-turbo";

async function createEnterSequencesApi(): Promise<Hono<Env>> {
    const routePath =
        "../../enter.pollinations.ai/src/routes/model-sequences.ts";
    const { modelSequencesRoutes } = (await import(routePath)) as {
        modelSequencesRoutes: Hono;
    };
    return new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            await next();
        })
        .route("/api/my-models/sequences", modelSequencesRoutes)
        .onError(handleError);
}

const enterTestEnv = {
    ...env,
    GEN_BASE_URL: "https://gen.pollinations.ai",
};

async function signedSessionCookie(token: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.BETTER_AUTH_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(token),
    );
    const encodedSignature = btoa(
        String.fromCharCode(...new Uint8Array(signature)),
    );
    return `better-auth.session_token=${encodeURIComponent(`${token}.${encodedSignature}`)}`;
}

let githubIdCounter = 910_000_000;
let ownerCounter = 0;

async function createSequenceSession() {
    githubIdCounter += 1;
    ownerCounter += 1;
    const githubUsername = `seq-api-owner-${ownerCounter}`;
    const userId = await createTestUser({
        githubId: githubIdCounter,
        githubUsername,
    });
    const token = `seq-session-${crypto.randomUUID()}`;
    await db.insert(sessionTable).values({
        id: `session-${crypto.randomUUID()}`,
        token,
        userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    const cookie = await signedSessionCookie(token);
    return { userId, githubUsername, cookie };
}

async function request(
    app: Hono<Env>,
    path: string,
    init: RequestInit = {},
    cookie?: string,
): Promise<Response> {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("Cookie", cookie);
    if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const suffix = path === "/" ? "" : path;
    const ctx = createExecutionContext();
    return app.fetch(
        new Request(`http://localhost/api/my-models/sequences${suffix}`, {
            ...init,
            headers,
        }),
        enterTestEnv,
        ctx,
    );
}

type SequenceBody = {
    data: {
        id: string;
        modelId: string;
        name: string;
        title: string;
        description: string | null;
        modelIds: string[];
    };
};

describe("model sequences API", () => {
    it("creates, lists, updates and deletes a sequence", async () => {
        const app = await createEnterSequencesApi();
        const { githubUsername, cookie } = await createSequenceSession();

        const created = await request(
            app,
            "/",
            {
                method: "POST",
                body: JSON.stringify({
                    name: "reliable-chat",
                    title: "Reliable Chat",
                    description: "Falls back to nano",
                    modelIds: [PRIMARY, FALLBACK],
                }),
            },
            cookie,
        );
        expect(created.status).toBe(200);
        const createdBody = (await created.json()) as SequenceBody;
        expect(createdBody.data.modelId).toBe(
            `${githubUsername}/reliable-chat`,
        );
        expect(createdBody.data.modelIds).toEqual([PRIMARY, FALLBACK]);

        const listed = await request(app, "/", {}, cookie);
        expect(listed.status).toBe(200);
        const listedBody = (await listed.json()) as {
            data: SequenceBody["data"][];
        };
        expect(listedBody.data.map((row) => row.id)).toEqual([
            createdBody.data.id,
        ]);

        // Reordering so a pricier model becomes a fallback of a cheaper
        // primary is rejected, so updates keep the model list and change
        // metadata.
        const updated = await request(
            app,
            `/${createdBody.data.id}`,
            {
                method: "PUT",
                body: JSON.stringify({
                    title: "Very Reliable Chat",
                    description: "Still falls back to nano",
                    modelIds: [PRIMARY, FALLBACK],
                }),
            },
            cookie,
        );
        expect(updated.status).toBe(200);
        const updatedBody = (await updated.json()) as SequenceBody;
        expect(updatedBody.data.title).toBe("Very Reliable Chat");
        expect(updatedBody.data.description).toBe("Still falls back to nano");

        const removed = await request(
            app,
            `/${createdBody.data.id}`,
            { method: "DELETE" },
            cookie,
        );
        expect(removed.status).toBe(200);

        const listedAfter = await request(app, "/", {}, cookie);
        const listedAfterBody = (await listedAfter.json()) as {
            data: unknown[];
        };
        expect(listedAfterBody.data).toEqual([]);
    });

    it("rejects a fallback priced above the primary", async () => {
        const app = await createEnterSequencesApi();
        const { cookie } = await createSequenceSession();
        const response = await request(
            app,
            "/",
            {
                method: "POST",
                body: JSON.stringify({
                    name: "uphill",
                    title: "Uphill",
                    modelIds: [FALLBACK, PRIMARY],
                }),
            },
            cookie,
        );
        expect(response.status).toBe(400);
    });

    it("rejects a paid-only fallback under a non-paid primary", async () => {
        const app = await createEnterSequencesApi();
        const { cookie } = await createSequenceSession();
        const response = await request(
            app,
            "/",
            {
                method: "POST",
                body: JSON.stringify({
                    name: "paid-fallback",
                    title: "Paid Fallback",
                    modelIds: [PRIMARY, PAID_ONLY_MODEL],
                }),
            },
            cookie,
        );
        expect(response.status).toBe(400);
    });

    it("rejects a fallback with a different event type", async () => {
        const app = await createEnterSequencesApi();
        const { cookie } = await createSequenceSession();
        const response = await request(
            app,
            "/",
            {
                method: "POST",
                body: JSON.stringify({
                    name: "mixed",
                    title: "Mixed",
                    modelIds: [PRIMARY, IMAGE_MODEL],
                }),
            },
            cookie,
        );
        expect(response.status).toBe(400);
    });

    it("rejects nested sequences", async () => {
        const app = await createEnterSequencesApi();
        const { githubUsername, cookie } = await createSequenceSession();
        const created = await request(
            app,
            "/",
            {
                method: "POST",
                body: JSON.stringify({
                    name: "inner",
                    title: "Inner",
                    modelIds: [PRIMARY, FALLBACK],
                }),
            },
            cookie,
        );
        expect(created.status).toBe(200);

        const nested = await request(
            app,
            "/",
            {
                method: "POST",
                body: JSON.stringify({
                    name: "outer",
                    title: "Outer",
                    modelIds: [PRIMARY, `${githubUsername}/inner`],
                }),
            },
            cookie,
        );
        expect(nested.status).toBe(400);
        const body = await nested.json();
        expect(JSON.stringify(body)).toContain("nested");
    });

    it("rejects unknown and duplicated models", async () => {
        const app = await createEnterSequencesApi();
        const { cookie } = await createSequenceSession();

        const unknown = await request(
            app,
            "/",
            {
                method: "POST",
                body: JSON.stringify({
                    name: "unknown",
                    title: "Unknown",
                    modelIds: [PRIMARY, "no/such-model"],
                }),
            },
            cookie,
        );
        expect(unknown.status).toBe(400);

        // An alias resolves to the same canonical id as the primary, so the
        // pair is a duplicate.
        const duplicated = await request(
            app,
            "/",
            {
                method: "POST",
                body: JSON.stringify({
                    name: "duplicated",
                    title: "Duplicated",
                    modelIds: [PRIMARY, "gpt-5.4"],
                }),
            },
            cookie,
        );
        expect(duplicated.status).toBe(400);
    });

    it("requires authentication", async () => {
        const app = await createEnterSequencesApi();
        const response = await request(app, "/");
        expect(response.status).toBe(401);
    });
});
