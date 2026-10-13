import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "./contexts.js";
import { type UseTextValue, useText } from "./generation.js";

function authValue(
    overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
    return {
        apiKey: "pk_test",
        isLoggedIn: true,
        isHydrated: true,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        setApiKey: vi.fn(),
        enterUrl: "https://enter.example",
        apiBaseUrl: "https://enter.example/api",
        ...overrides,
    };
}

function chatResponse(content: string): Response {
    return new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        { headers: { "Content-Type": "application/json" } },
    );
}

/** A fetch that resolves only when `respond` is called, and honours abort. */
function pendingFetch() {
    const calls: {
        init: RequestInit;
        respond: (content: string) => void;
    }[] = [];
    const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation((_url, init = {}) => {
            return new Promise<Response>((resolve, reject) => {
                init.signal?.addEventListener("abort", () =>
                    reject(new DOMException("Aborted", "AbortError")),
                );
                calls.push({
                    init,
                    respond: (content) => resolve(chatResponse(content)),
                });
            });
        });
    return { fetchMock, calls };
}

async function flush() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await Promise.resolve();
        });
    }
}

function read<T>(value: T | null): T {
    if (!value) throw new Error("Expected hook value to be set");
    return value;
}

describe("generation hooks", () => {
    let latest: UseTextValue | null = null;
    let renderer: ReactTestRenderer | null = null;

    function Probe() {
        latest = useText();
        return null;
    }

    async function mount(value: AuthContextValue) {
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={value}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });
    }

    async function rerender(value: AuthContextValue) {
        await act(async () => {
            read(renderer).update(
                <AuthContext.Provider value={value}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });
    }

    afterEach(async () => {
        await act(async () => renderer?.unmount());
        renderer = null;
        latest = null;
        vi.restoreAllMocks();
    });

    it("sends nothing on mount and runs with the provider key", async () => {
        const { fetchMock, calls } = pendingFetch();
        await mount(authValue());
        expect(fetchMock).not.toHaveBeenCalled();
        expect(read(latest).isLoading).toBe(false);

        let result: Promise<string | null> = Promise.resolve(null);
        await act(async () => {
            result = read(latest).run("hello", { model: "openai" });
        });
        expect(read(latest).isLoading).toBe(true);
        expect(new Headers(calls[0].init.headers).get("Authorization")).toBe(
            "Bearer pk_test",
        );
        expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
            model: "openai",
            messages: [{ role: "user", content: "hello" }],
        });

        calls[0].respond("hi there");
        await flush();
        expect(await result).toBe("hi there");
        expect(read(latest)).toMatchObject({
            data: "hi there",
            isLoading: false,
            error: null,
        });
    });

    it("cancel aborts quietly and keeps the last result", async () => {
        const { calls } = pendingFetch();
        await mount(authValue());

        await act(async () => {
            void read(latest).run("first");
        });
        calls[0].respond("first answer");
        await flush();

        await act(async () => {
            void read(latest).run("second");
        });
        expect(read(latest).isLoading).toBe(true);
        await act(async () => read(latest).cancel());
        await flush();

        expect(calls[1].init.signal?.aborted).toBe(true);
        expect(read(latest)).toMatchObject({
            data: "first answer",
            isLoading: false,
            error: null,
        });
    });

    it("a new run supersedes the one in flight", async () => {
        const { calls } = pendingFetch();
        await mount(authValue());

        await act(async () => {
            void read(latest).run("slow");
            void read(latest).run("fast");
        });
        expect(calls[0].init.signal?.aborted).toBe(true);
        calls[1].respond("fast answer");
        await flush();
        expect(read(latest).data).toBe("fast answer");
    });

    it("rerun repeats the last arguments", async () => {
        const { calls } = pendingFetch();
        await mount(authValue());

        await act(async () => {
            void read(latest).run("again", { model: "openai" });
        });
        calls[0].respond("one");
        await flush();
        await act(async () => {
            void read(latest).rerun();
        });
        calls[1].respond("two");
        await flush();

        expect(JSON.parse(String(calls[1].init.body))).toMatchObject({
            model: "openai",
            messages: [{ role: "user", content: "again" }],
        });
        expect(read(latest).data).toBe("two");
    });

    it("a key change aborts the old request so it cannot update state", async () => {
        const { calls } = pendingFetch();
        await mount(authValue({ apiKey: "pk_alice" }));

        await act(async () => {
            void read(latest).run("secret");
        });
        await rerender(authValue({ apiKey: "pk_bob" }));
        expect(calls[0].init.signal?.aborted).toBe(true);

        calls[0].respond("alice's answer");
        await flush();
        expect(read(latest)).toMatchObject({
            data: null,
            isLoading: false,
            error: null,
        });
    });

    it("clears the result on logout and refuses to run without a key", async () => {
        const { fetchMock, calls } = pendingFetch();
        await mount(authValue());
        await act(async () => {
            void read(latest).run("hello");
        });
        calls[0].respond("hi");
        await flush();
        expect(read(latest).data).toBe("hi");

        await rerender(authValue({ apiKey: null, isLoggedIn: false }));
        expect(read(latest).data).toBeNull();

        await act(async () => {
            await read(latest).run("hello");
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(read(latest).error?.message).toBe(
            "Log in to Pollinations first",
        );
    });

    it("reports errors and logs out on 401", async () => {
        const value = authValue();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ error: { message: "bad key" } }), {
                status: 401,
            }),
        );
        await mount(value);
        await act(async () => {
            await read(latest).run("hello");
        });
        expect(read(latest).error?.message).toContain("bad key");
        expect(read(latest).isLoading).toBe(false);
        expect(value.logout).toHaveBeenCalledTimes(1);
    });
});
