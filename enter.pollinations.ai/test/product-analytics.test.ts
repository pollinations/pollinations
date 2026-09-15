import {
    createExecutionContext,
    env,
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

test("disabled tracking does no network IO or session lookup", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await captureProductEvent(env, "signup_completed", "user-1");
    const response = await pageView({ page: "/top-up" }, "", {}, "false");
    expect(response.status).toBe(204);
    expect(fetch).not.toHaveBeenCalled();
});

test("page schema accepts only fixed labels, never URLs or identity/event overrides", () => {
    expect(productPageViewSchema.safeParse({ page: "/top-up" }).success).toBe(
        true,
    );
    for (const body of [
        { page: "/top-up?key=secret" },
        { page: "/top-up#secret" },
        { page: "https://example.com" },
        { page: "/private-user-id" },
        { page: "/top-up", user_id: "someone-else" },
        { page: "/top-up", event: "payment_completed" },
    ])
        expect(productPageViewSchema.safeParse(body).success).toBe(false);
});

test("browser cannot submit server events, cross-origin traffic, or request bodies", async () => {
    expect(
        (await pageView({ page: "/top-up", event: "payment_completed" }))
            .status,
    ).toBe(400);
    expect(
        (
            await pageView({ page: "/top-up" }, "", {
                Origin: "https://untrusted.example",
            })
        ).status,
    ).toBe(403);
    expect(
        (await pageView({ page: "/top-up" }, "", {}, "true", "x".repeat(2000)))
            .status,
    ).toBe(415);
    expect((await pageView({ page: "x".repeat(2000) })).status).toBe(400);
    expect((await pageView({ page: "/top-up" }, "", { DNT: "1" })).status).toBe(
        204,
    );
});

test("page views require a session, not an API key", async ({ apiKey }) => {
    expect((await pageView({ page: "/top-up" })).status).toBe(401);
    expect(
        (
            await pageView({ page: "/top-up" }, "", {
                Authorization: `Bearer ${apiKey}`,
            })
        ).status,
    ).toBe(401);
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
        (
            await pageView(
                { page: "/top-up" },
                `better-auth.session_token=${sessionToken}`,
            )
        ).status,
    ).toBe(204);
    expect(rows).toEqual([
        {
            event: "page_viewed",
            page: "/top-up",
            user_id: user?.user_id,
            event_id: expect.any(String),
            timestamp: expect.any(String),
            environment: "test",
        },
    ]);
});

test("capture reuses Tinybird ingestion, preserving amount/currency and event ID", async () => {
    const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 202 }));
    await captureProductEvent(
        bindings,
        "payment_completed",
        "user-1",
        {
            amount_total_minor: 1123,
            currency: "eur",
            payment_source: "checkout",
        },
        "payment:cs-1",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("name")).toBe("product_event");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${env.TINYBIRD_INGEST_TOKEN}`,
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
        event: "payment_completed",
        user_id: "user-1",
        event_id: "payment:cs-1",
        amount_total_minor: 1123,
        currency: "eur",
        payment_source: "checkout",
        environment: "test",
    });
});

test("delivery failure never fails the caller and is not retried", async () => {
    const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
        captureProductEvent(bindings, "signup_completed", "user-1"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
        captureProductEvent(bindings, "signup_completed", "user-1"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
});
