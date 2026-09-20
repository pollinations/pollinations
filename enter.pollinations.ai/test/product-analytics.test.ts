import {
    createExecutionContext,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { productPageViewSchema } from "@shared/product-analytics.ts";
import { afterEach, expect, vi } from "vitest";
import { productAnalyticsRoutes } from "../src/routes/product-analytics.ts";
import { captureProductEvent } from "../src/utils/product-analytics.ts";
import { test } from "./fixtures.ts";

afterEach(() => vi.restoreAllMocks());

async function pageView(
    query: Record<string, string>,
    cookie = "",
    overrides: Record<string, string> = {},
    body?: string,
) {
    const ctx = createExecutionContext();
    const response = await productAnalyticsRoutes.fetch(
        new Request(
            `http://localhost:3000/page-view?${new URLSearchParams(query)}`,
            {
                method: "POST",
                headers: {
                    Origin: "http://localhost:3000",
                    Cookie: cookie,
                    ...overrides,
                },
                body,
            },
        ),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

const VIEW = { page: "/top-up" };

test("page schema accepts only fixed labels and length-capped attribution, never an identifier", () => {
    expect(productPageViewSchema.safeParse(VIEW).success).toBe(true);
    expect(
        productPageViewSchema.safeParse({
            ...VIEW,
            referrer_host: "github.com",
            utm_source: "readme",
            client_id: "pk_abc",
        }).success,
    ).toBe(true);
    expect(
        new URLSearchParams(
            productPageViewSchema.parse(VIEW) as Record<string, string>,
        ).toString(),
    ).toBe("page=%2Ftop-up");
    for (const body of [
        { page: "/top-up?key=secret" },
        { page: "https://example.com" },
        { ...VIEW, flow_id: "0f4b2a6e-1c3d-4e5f-8a9b-0c1d2e3f4a5b" },
        { ...VIEW, user_id: "someone-else" },
        { ...VIEW, event: "payment_completed" },
        { ...VIEW, utm_source: "x".repeat(101) },
    ])
        expect(productPageViewSchema.safeParse(body).success).toBe(false);
});

test("browser cannot submit server events or cross-origin traffic", async () => {
    expect(
        (await pageView({ ...VIEW, event: "payment_completed" })).status,
    ).toBe(400);
    expect(
        (
            await pageView(VIEW, "", {
                Origin: "https://untrusted.example",
            })
        ).status,
    ).toBe(403);
    // Every POST has a body at the edge, so one must not be rejected: the
    // handler reads the query string and never the body.
    expect((await pageView(VIEW, "", {}, "x".repeat(2000))).status).toBe(204);
    expect((await pageView({ page: "x".repeat(2000) })).status).toBe(400);
});

test("signed-out views are recorded without a user and pass attribution through", async ({
    apiKey,
}) => {
    const originalFetch = globalThis.fetch;
    const rows: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        if (
            new URL(String(input)).searchParams.get("name") === "product_event"
        ) {
            rows.push(JSON.parse(String(init?.body)));
            return new Response(null, { status: 202 });
        }
        return originalFetch(input, init);
    });
    const view = {
        page: "/news",
        referrer_host: "github.com",
        utm_source: "readme",
        utm_campaign: "launch",
        client_id: "pk_app",
    };
    expect((await pageView(view)).status).toBe(204);
    expect(
        (await pageView(view, "", { Authorization: `Bearer ${apiKey}` }))
            .status,
    ).toBe(204);
    expect(rows).toEqual([
        expect.objectContaining({
            ...view,
            event: "page_viewed",
            user_id: "",
        }),
        expect.objectContaining({ user_id: "" }),
    ]);
});

test("page views derive the user from the authenticated session", async ({
    sessionToken,
}) => {
    const originalFetch = globalThis.fetch;
    const rows: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        if (
            new URL(String(input)).searchParams.get("name") === "product_event"
        ) {
            rows.push(JSON.parse(String(init?.body)));
            return new Response(null, { status: 202 });
        }
        return originalFetch(input, init);
    });
    const user = await env.DB.prepare(
        "SELECT id AS user_id FROM user LIMIT 1",
    ).first<{ user_id: string }>();
    expect(user).toBeTruthy();
    expect(
        (await pageView(VIEW, `better-auth.session_token=${sessionToken}`))
            .status,
    ).toBe(204);
    expect(rows).toEqual([
        {
            event: "page_viewed",
            page: "/top-up",
            user_id: user?.user_id,
            timestamp: expect.any(String),
            environment: "test",
        },
    ]);
});

test("capture reuses Tinybird ingestion and carries the pack key", async () => {
    const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 202 }));
    await captureProductEvent(env, "checkout_started", "user-1", {
        pack_key: "pack-1",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("name")).toBe("product_event");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${env.TINYBIRD_INGEST_TOKEN}`,
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
        event: "checkout_started",
        user_id: "user-1",
        pack_key: "pack-1",
        environment: "test",
    });
});

test("delivery failure never fails the caller and is not retried", async () => {
    const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
        captureProductEvent(env, "checkout_started", "user-1"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
        captureProductEvent(env, "checkout_started", "user-1"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
});

test("signing in records the request to GitHub and the resulting session", async ({
    mocks,
}) => {
    await mocks.enable("github", "tinybird");
    const started = await SELF.fetch(
        "http://localhost:3000/api/auth/sign-in/social",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Referer: "http://localhost:3000/sign-in",
            },
            body: JSON.stringify({ provider: "github" }),
        },
    );
    expect(started.status).toBe(200);
    const cookies = started.headers.get("Set-Cookie") ?? "";
    const state = new URL(
        ((await started.json()) as { url: string }).url,
    ).searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await SELF.fetch(
        `http://localhost:3000/api/auth/callback/github?code=test-code&state=${state}`,
        { headers: { Cookie: cookies }, redirect: "manual" },
    );
    expect(callback.status).toBe(302);
    await callback.text();

    // Both stages are plain server-side counts: no cookie, no browser id.
    const signIn = mocks.tinybird.state.productEvents.filter((row) =>
        String(row.event).startsWith("sign_in_"),
    );
    // The middle stage splits the loss: a start that never returns was lost at
    // GitHub, a return that never completes was lost in our own callback.
    expect(signIn.map((row) => row.event)).toEqual([
        "sign_in_started",
        "sign_in_returned",
        "sign_in_completed",
    ]);
    expect(signIn[0]?.user_id).toBe("");
    expect(signIn[2]?.user_id).toEqual(expect.any(String));
    expect(signIn[2]?.user_id).not.toBe("");
    // The start carries the page it came from, so the funnel can divide it by
    // views of that same page.
    expect(signIn[0]?.page).toBe("/sign-in");
    // A first sign-in also created the user, which is what separates new from
    // returning without joining the daily d1_user snapshot.
    const signup = mocks.tinybird.state.productEvents.find(
        (row) => row.event === "signup_completed",
    );
    expect(signup?.user_id).toBe(signIn[2]?.user_id);
});

test("a start from an untracked page stays out of the funnel ratio", async ({
    mocks,
}) => {
    await mocks.enable("github", "tinybird");
    const started = await SELF.fetch(
        "http://localhost:3000/api/auth/sign-in/social",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Referer: "https://pollinations.ai/some/other/page",
            },
            body: JSON.stringify({ provider: "github" }),
        },
    );
    expect(started.status).toBe(200);
    const start = mocks.tinybird.state.productEvents.find(
        (row) => row.event === "sign_in_started",
    );
    expect(start?.page ?? "").toBe("");
    // The host is recorded even when the path is not one of ours: most starts
    // come from outside the tracked routes and would otherwise be one bucket.
    expect(start?.referrer_host).toBe("pollinations.ai");
});

test("an external path that collides with one of our routes is not our page", async ({
    mocks,
}) => {
    await mocks.enable("github", "tinybird");
    // '/' is a route of ours, so matching the path alone would credit this
    // start to our landing page.
    const started = await SELF.fetch(
        "http://localhost:3000/api/auth/sign-in/social",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Referer: "https://pollinations.ai/",
            },
            body: JSON.stringify({ provider: "github" }),
        },
    );
    expect(started.status).toBe(200);
    const start = mocks.tinybird.state.productEvents.find(
        (row) => row.event === "sign_in_started",
    );
    expect(start?.referrer_host).toBe("pollinations.ai");
    expect(start?.page ?? "").toBe("");
});
