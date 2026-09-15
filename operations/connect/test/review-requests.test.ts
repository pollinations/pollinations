import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDefaultErrorMessage } from "../../../shared/error";
import {
    createReviewRequests,
    describeReviewRequest,
    parseReviewRequests,
} from "../review-requests";

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
    it.each([
        "/api/api-keys",
        "/api/oauth/code",
        "/api/auth/delete-user",
    ])("distinguishes a failed operation from maintenance for %s", async (path) => {
        const transport = createReviewRequests();
        const rule = { path, method: "POST", outcome: "server-error" } as const;
        transport.configure([rule]);
        const request = new Request(`http://localhost:4180${path}`, {
            method: "POST",
        });
        const response = await transport.intercept(request);
        expect(response?.status).toBe(500);
        const body = await response?.json();
        const error = path.startsWith("/api/auth/") ? body : body.error;
        expect(error).toMatchObject({
            code: "INTERNAL_ERROR",
            message: getDefaultErrorMessage(500),
        });
        expect(JSON.stringify(body)).not.toContain(getDefaultErrorMessage(503));
        expect(transport.evidence().consumed).toEqual([rule]);
        expect(describeReviewRequest(rule)).toContain(
            `Injected HTTP 500: POST ${path}`,
        );
        expect(describeReviewRequest(rule)).toContain(
            "not an endpoint-generated error",
        );
        transport.configure([]);
        expect(await transport.intercept(request)).toBeUndefined();
    });
    it("rejects unknown faults instead of silently presenting maintenance", () => {
        for (const outcome of [
            "failed",
            "constructor",
            "toString",
            500,
            null,
            {},
        ]) {
            expect(() =>
                parseReviewRequests([{ path: "/api/api-keys", outcome }]),
            ).toThrow();
        }
    });
    it("keeps the selected read failure separate from writes until the situation changes", async () => {
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
        expect((await transport.intercept(new Request(url)))?.status).toBe(503);
        expect(transport.evidence().consumed).toEqual([
            { path: "/api/api-keys", outcome: "unavailable" },
        ]);
        transport.reset();
        expect(await transport.intercept(new Request(url))).toBeUndefined();
        expect(transport.evidence().consumed).toEqual([]);
    });
    it("keeps a held write pending across rule changes until its page aborts", async () => {
        vi.useFakeTimers();
        const transport = createReviewRequests();
        transport.configure([
            { path: "/api/api-keys", method: "POST", outcome: "pending" },
        ]);
        const controller = new AbortController();
        const response = transport.intercept(
            new Request("http://localhost:4180/api/api-keys", {
                method: "POST",
                signal: controller.signal,
            }),
        );
        let settled = false;
        const completion = response.then(
            () => {
                settled = true;
            },
            (error) => {
                settled = true;
                return error;
            },
        );
        await vi.advanceTimersByTimeAsync(60_000);
        expect(settled).toBe(false);
        transport.configure([]);
        await vi.advanceTimersByTimeAsync(1000);
        expect(settled).toBe(false);
        controller.abort();
        expect(await completion).toMatchObject({ name: "AbortError" });
        expect(
            await transport.intercept(
                new Request("http://localhost:4180/api/api-keys", {
                    method: "POST",
                }),
            ),
        ).toBeUndefined();
    });
    it("aborts the outgoing HTTP request without a response or forwarding a held write", async () => {
        const transport = createReviewRequests();
        transport.configure([
            { path: "/api/review-probe", method: "POST", outcome: "pending" },
        ]);
        const forwarded: string[] = [];
        let incoming: Request | undefined;
        let notifyArrival!: () => void;
        const arrived = new Promise<void>((resolve) => {
            notifyArrival = resolve;
        });
        const server = serve({
            hostname: "127.0.0.1",
            port: 0,
            overrideGlobalObjects: false,
            fetch: async (request) => {
                incoming = request;
                notifyArrival();
                const response = await transport.intercept(request);
                if (response) return response;
                forwarded.push(request.method);
                return new Response(null, { status: 204 });
            },
        });
        const controller = new AbortController();
        try {
            await once(server, "listening");
            const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/review-probe`;
            let settled = false;
            const result = fetch(url, {
                method: "POST",
                signal: controller.signal,
            }).then(
                (response) => {
                    settled = true;
                    return response.status;
                },
                (error) => {
                    settled = true;
                    return error.name;
                },
            );
            await arrived;
            transport.reset();
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(settled).toBe(false);
            controller.abort();
            expect(await result).toBe("AbortError");
            await vi.waitFor(() => expect(incoming?.signal.aborted).toBe(true));
            expect(forwarded).toEqual([]);
            expect((await fetch(url)).status).toBe(204);
            expect(forwarded).toEqual(["GET"]);
        } finally {
            controller.abort();
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
    it("cancels a held request when its page closes", async () => {
        const transport = createReviewRequests();
        transport.configure([
            { path: "/api/auth/get-session", outcome: "pending" },
        ]);
        const controller = new AbortController();
        const result = transport.intercept(
            new Request("http://localhost:4180/api/auth/get-session", {
                signal: controller.signal,
            }),
        );
        const cancelled = expect(result).rejects.toMatchObject({
            name: "AbortError",
        });
        controller.abort();
        await cancelled;
    });
});
