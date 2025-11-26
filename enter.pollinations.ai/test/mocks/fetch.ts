import type { Hono } from "hono";
import { vi } from "vitest";
import { getLogger } from "@logtape/logtape";

const originalFetch = globalThis.fetch;
const activeRequests = new Set<Promise<any>>();

export type MockMap = {
    [name: string]: MockAPI<any>;
};
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
        url.pathname = url.pathname.endsWith("/")
            ? url.pathname.slice(0, -1)
            : url.pathname;
        const mockRequest = new Request(url, {
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

export function createFetchMock<TMocks extends MockMap>(
    mocks: TMocks,
    options?: FetchMockOptions,
) {
    const log = getLogger(["test", "mock", "fetch"]);
    const opts = options ?? {};
    let handlers: MockHandlerMap = {};

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
                    log.debug(`${request.method} ${request.url}`);
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

    const enable = async (...names: (keyof TMocks)[]) => {
        await clear();
        for (const name of names) {
            const mock = mocks[name];
            handlers = {
                ...handlers,
                ...mock.handlerMap,
            };
        }
    };

    const clear = async () => {
        await Promise.allSettled(Array.from(activeRequests));
        activeRequests.clear();
        handlers = {};
    };

    return {
        enable,
        clear,
        ...mocks,
    };
}

export async function teardownFetchMock() {
    // Wait for active requests to complete
    await Promise.allSettled(Array.from(activeRequests));
    activeRequests.clear();

    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
}
