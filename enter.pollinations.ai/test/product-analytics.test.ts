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
const bindings = { ...env, TINYBIRD_ANALYTICS_ENABLED: "true" };

async function pageView(
    query: Record<string, string>,
    cookie = "",
    overrides: Record<string, string> = {},
    enabled = "true",
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
        { ...bindings, TINYBIRD_ANALYTICS_ENABLED: enabled },
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

test("disabled tracking does no network IO", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await captureProductEvent(
        { ...env, TINYBIRD_ANALYTICS_ENABLED: "false" },
        "checkout_started",
        "user-1",
    );
    const response = await pageView(VIEW, "", {}, "false");
    expect(response.status).toBe(204);
    expect(fetch).not.toHaveBeenCalled();
});

const FLOW_ID = "0f4b2a6e-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
const VIEW = { page: "/top-up", flow_id: FLOW_ID };

test("page schema accepts only fixed labels, a tab id and length-capped attribution", () => {
    expect(productPageViewSchema.safeParse(VIEW).success).toBe(true);
    expect(
        productPageViewSchema.safeParse({
            ...VIEW,
            referrer_host: "github.com",
            utm_source: "readme",
            client_id: "pk_abc",
        }).success,
    ).toBe(true);
    for (const body of [
        { page: "/top-up" },
        { ...VIEW, page: "/top-up?key=secret" },
        { ...VIEW, page: "https://example.com" },
        { ...VIEW, flow_id: "not-a-uuid" },
        { ...VIEW, user_id: "someone-else" },
        { ...VIEW, event: "payment_completed" },
        { ...VIEW, utm_source: "x".repeat(101) },
    ])
        expect(productPageViewSchema.safeParse(body).success).toBe(false);
});

test("browser cannot submit server events, cross-origin traffic, or request bodies", async () => {
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
    expect(
        (await pageView(VIEW, "", {}, "true", "x".repeat(2000))).status,
    ).toBe(415);
    expect((await pageView({ page: "x".repeat(2000) })).status).toBe(400);
    expect((await pageView(VIEW, "", { DNT: "1" })).status).toBe(204);
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
        page: "/_dashboard/news",
        flow_id: FLOW_ID,
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
            event_id: `view:${FLOW_ID}:/_dashboard/news`,
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
            flow_id: FLOW_ID,
            user_id: user?.user_id,
            event_id: `view:${FLOW_ID}:/top-up`,
            timestamp: expect.any(String),
            environment: "test",
        },
    ]);
});

test("capture reuses Tinybird ingestion, preserving pack key and event ID", async () => {
    const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 202 }));
    await captureProductEvent(
        bindings,
        "checkout_started",
        "user-1",
        { pack_key: "pack-1" },
        "checkout:cs-1",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("name")).toBe("product_event");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${env.TINYBIRD_INGEST_TOKEN}`,
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
        event: "checkout_started",
        user_id: "user-1",
        event_id: "checkout:cs-1",
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
        captureProductEvent(bindings, "checkout_started", "user-1"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
        captureProductEvent(bindings, "checkout_started", "user-1"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
});

test("a tab that signs in keeps its flow id, so the sign-in is derivable", async ({
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
    const view = { page: "/sign-in", flow_id: FLOW_ID } as const;
    expect((await pageView(view)).status).toBe(204);
    expect(
        (await pageView(view, `better-auth.session_token=${sessionToken}`))
            .status,
    ).toBe(204);
    expect(rows.map((row) => [row.flow_id, row.user_id])).toEqual([
        [FLOW_ID, ""],
        [FLOW_ID, user?.user_id],
    ]);
});

test("server events skip browsers that opted out", async ({ mocks }) => {
    await mocks.enable("tinybird");
    const issued = await SELF.fetch("http://localhost:3000/api/device/code", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Sec-GPC": "1" },
        body: JSON.stringify({ client_id: "test-cli" }),
    });
    expect(issued.status).toBe(200);
    await mocks.clear();
    expect(mocks.tinybird.state.productEvents).toEqual([]);
});
