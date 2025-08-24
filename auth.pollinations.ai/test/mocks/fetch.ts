import type { Hono } from "hono";
import { vi } from "vitest";

const originalFetch = globalThis.fetch;

export type MockHandler = (request: Request) => Response | Promise<Response>;
export type MockHandlerMap = { [hostname: string]: MockHandler };

export function createHonoMockHandler(handler: Hono): MockHandler {
    return (request: Request) => {
        const url = new URL(request.url);
        const mockUrl = new URL(url.pathname + url.search, "http://localhost");
        const mockRequest = new Request(mockUrl, {
            method: request.method,
            headers: request.headers,
            body: request.body,
        });
        return handler.fetch(mockRequest);
    };
}

type FetchMockOptions = {
    logRequests?: boolean;
};

export function setupFetchMock(
    handlers: MockHandlerMap,
    options?: FetchMockOptions,
) {
    const opts = options ?? {};

    const mockHandler = (request: Request) => {
        const url = new URL(request.url);
        const handler = handlers[url.hostname];
        if (!handler) return originalFetch(request);
        return handler(request);
    };

    globalThis.fetch = vi
        .fn()
        .mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                let url: URL;
                let request: Request;

                if (input instanceof Request) {
                    request = input;
                    url = new URL(request.url);
                } else {
                    url = typeof input === "string" ? new URL(input) : input;
                    request = new Request(url, init);
                }
                if (opts.logRequests) {
                    console.log(`[FETCH] ${request.method} ${request.url}`);
                }
                return mockHandler(request);
            },
        );
}

export function teardownFetchMock() {
    globalThis.fetch = originalFetch; // Restore original fetch
}
