import { analyticsConfig, analyticsEnabled } from "@frontend/lib/posthog.ts";
import type { CaptureResult } from "posthog-js";
import { afterEach, expect, test, vi } from "vitest";
import { capturePostHog } from "../src/utils/posthog.ts";

afterEach(() => vi.restoreAllMocks());

const configured = {
    ENVIRONMENT: "test",
    POSTHOG_PROJECT_TOKEN: "phc_test_only",
    POSTHOG_HOST: "https://posthog.invalid",
};

test("unconfigured analytics makes no requests", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await capturePostHog({ ENVIRONMENT: "test" }, "signup_completed", "user-1");
    await capturePostHog(
        { ...configured, POSTHOG_HOST: undefined },
        "signup_completed",
        "user-1",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(analyticsEnabled).toBe(false);
});

test("server SDK sends stable user identity and explicit properties", async () => {
    const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(Response.json({ status: 1 }));
    await capturePostHog(configured, "payment_completed", "user-1", {
        amount_total_minor: 1123,
        currency: "eur",
        payment_source: "checkout",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toContain("https://posthog.invalid/");
    const body = new Response(init?.body).body;
    if (!body) throw new Error("Missing capture body");
    const payload = (await new Response(
        body.pipeThrough(new DecompressionStream("gzip")),
    ).json()) as { batch: unknown[] };
    expect(payload.batch[0]).toMatchObject({
        event: "payment_completed",
        distinct_id: "user-1",
        properties: {
            amount_total_minor: 1123,
            currency: "eur",
            payment_source: "checkout",
            environment: "test",
            $geoip_disable: true,
        },
    });
});

test("delivery failure cannot fail the application or retry a payment event", async () => {
    const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
        capturePostHog(configured, "payment_completed", "user-1"),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
});

test("browser configuration strips sensitive SDK properties, including identify properties", () => {
    const sanitize = analyticsConfig.before_send;
    if (typeof sanitize !== "function") throw new Error("Missing sanitizer");
    for (const event of ["page_viewed", "$identify"]) {
        const result = sanitize({
            event,
            $set: { email: "private@example.com" },
            $set_once: { $initial_current_url: "secret" },
            properties: {
                distinct_id: "user-1",
                $anon_distinct_id: "anonymous-1",
                page: "/top-up",
                $current_url:
                    "https://example.com/authorize?client_id=secret#api_key=secret",
                $referrer: "https://example.com/?token=secret",
                $set: {
                    $initial_current_url: "secret",
                    email: "private@example.com",
                },
                $set_once: { $initial_referrer: "secret" },
                email: "private@example.com",
                prompt: "private",
                token: "phc_test_only",
            },
        } as CaptureResult);
        expect(result?.properties).toEqual({
            distinct_id: "user-1",
            $anon_distinct_id: "anonymous-1",
            page: "/top-up",
            environment: "test",
            $geoip_disable: true,
            token: "phc_test_only",
        });
        expect(result?.$set).toBeUndefined();
        expect(result?.$set_once).toBeUndefined();
    }
    expect(analyticsConfig).toMatchObject({
        persistence: "memory",
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        advanced_disable_flags: true,
    });
});
