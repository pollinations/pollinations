import type { Hono } from "hono";
import { vi } from "vitest";
import { getLogger } from "@logtape/logtape";

const originalFetch = globalThis.fetch;
const activeRequests = new Set<Promise<any>>();

export type MockHandler = (request: Request) => Promise<Response>;
export type MockHandlerMap = { [hostname: string]: MockHandler };

export type MockAPI<TState> = {
    state: TState;
    handlerMap: MockHandlerMap;
    reset: () => void;
};

export function createHonoMockHandler(handler: Hono): MockHandler {
    return async (request: Request) => {
        const url = new URL(request.url);
        // trim trailing slashes
        const pathname = url.pathname.endsWith("/")
            ? url.pathname.slice(0, -1)
            : url.pathname;
        const mockUrl = new URL(pathname + url.search, "http://localhost");
        const mockRequest = new Request(mockUrl, {
            method: request.method,
            headers: request.headers,
            body: request.body,
        });
        return await handler.fetch(mockRequest);
    };
}

type FetchMockOptions = {
    logRequests?: boolean;
};

export function setupFetchMock(
    handlers: MockHandlerMap,
    options?: FetchMockOptions,
) {
    const log = getLogger(["test", "mock"]);
    const opts = options ?? {};

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
                    log.debug(`[FETCH] ${request.method} ${request.url}`);
                }

                const handler = handlers[url.host];
                const responsePromise = handler
                    ? handler(request)
                    : originalFetch(request);
                activeRequests.add(responsePromise);

                const response = await responsePromise;
                activeRequests.delete(responsePromise);

                return response;
            },
        );
}

export async function teardownFetchMock() {
    // Wait for active requests to complete
    await Promise.allSettled(Array.from(activeRequests));
    activeRequests.clear();

    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
}
