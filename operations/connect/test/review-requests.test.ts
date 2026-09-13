import { afterEach, describe, expect, it, vi } from "vitest";
import { createReviewRequests, parseReviewRequests } from "../review-requests";

afterEach(() => vi.useRealTimers());
describe("local review transport", () => {
    it("rejects nonlocal targets and arbitrary response bodies", () => {
        for (const path of [
            "https://example.com/api/keys",
            "/__connect/reset",
            "/api/../__connect/reset",
        ])
            expect(() =>
                parseReviewRequests([{ path, outcome: "unavailable" }]),
            ).toThrow();
        expect(() =>
            parseReviewRequests([
                {
                    path: "/api/api-keys",
                    outcome: "unavailable",
                    body: { keys: [] },
                },
            ]),
        ).toThrow();
    });
    it.each([
        "/api/api-keys",
        "/api/auth/api-key/create",
    ])("returns the service error contract for %s", async (path) => {
        const transport = createReviewRequests();
        transport.configure([{ path, outcome: "unavailable" }]);
        const response = await transport.intercept(
            new Request(`http://localhost:4180${path}`),
        );
        expect(response?.status).toBe(503);
        const body = await response?.json();
        expect(
            path.startsWith("/api/auth/") ? body.message : body.error.message,
        ).toBeTruthy();
        expect(
            path.startsWith("/api/auth/") ? body.code : body.error.code,
        ).toBe("SERVICE_UNAVAILABLE");
    });
    it("keeps the selected read failure separate from writes and allows retry", async () => {
        vi.useFakeTimers();
        const transport = createReviewRequests();
        transport.configure([
            { path: "/api/api-keys", outcome: "unavailable" },
        ]);
        const url = "http://localhost:4180/api/api-keys";
        expect(
            await transport.intercept(new Request(url, { method: "POST" })),
        ).toBeUndefined();
        expect((await transport.intercept(new Request(url)))?.status).toBe(503);
        expect((await transport.intercept(new Request(url)))?.status).toBe(503);
        await vi.advanceTimersByTimeAsync(1001);
        expect(await transport.intercept(new Request(url))).toBeUndefined();
    });
    it("releases a pending write as unavailable when a case ends", async () => {
        const transport = createReviewRequests();
        transport.configure([
            { path: "/api/api-keys", method: "POST", outcome: "pending" },
        ]);
        const response = transport.intercept(
            new Request("http://localhost:4180/api/api-keys", {
                method: "POST",
            }),
        );
        transport.configure([]);
        expect((await response)?.status).toBe(503);
        expect(
            await transport.intercept(
                new Request("http://localhost:4180/api/api-keys", {
                    method: "POST",
                }),
            ),
        ).toBeUndefined();
    });
});
