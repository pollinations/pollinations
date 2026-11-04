import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isOutageError } from "../error-response.js";
import type { PollinationsError } from "../types.js";
import {
    AuthContext,
    type AuthContextValue,
    type AuthStateValue,
} from "./contexts.js";
import {
    type UseAccountKeyValue,
    useAccountKey,
    useAuthState,
    useTextGeneration,
} from "./hooks.js";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
    const status = init.status ?? 200;
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 401 ? "Unauthorized" : "OK",
        headers: new Headers(),
        json: async () => body,
    } as Response;
}

async function waitFor(condition: () => boolean) {
    for (let i = 0; i < 20; i++) {
        await act(async () => {
            await Promise.resolve();
        });
        if (condition()) return;
    }
    throw new Error("Timed out waiting for condition");
}

function read<T>(value: T | null): T {
    if (!value) throw new Error("Expected hook value to be set");
    return value;
}

function authValue(
    overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
    return {
        apiKey: "sk_test",
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

describe("account hooks", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("clears account data when disabled", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            jsonResponse({
                valid: true,
                type: "secret",
                permissions: { account: ["usage"], models: [] },
            }),
        );

        let latest: UseAccountKeyValue | null = null;
        const value = authValue();

        function Probe({ enabled }: { enabled: boolean }) {
            latest = useAccountKey({ enabled });
            return null;
        }

        let renderer: ReactTestRenderer | null = null;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={value}>
                    <Probe enabled={true} />
                </AuthContext.Provider>,
            );
        });

        await waitFor(() => latest?.data?.type === "secret");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://enter.example/api/account/key",
            { headers: { Authorization: "Bearer sk_test" } },
        );

        await act(async () => {
            renderer?.update(
                <AuthContext.Provider value={value}>
                    <Probe enabled={false} />
                </AuthContext.Provider>,
            );
        });

        expect(read<UseAccountKeyValue>(latest).data).toBeNull();
        expect(read<UseAccountKeyValue>(latest).isLoading).toBe(false);
        expect(read<UseAccountKeyValue>(latest).error).toBeNull();
    });

    it("exposes a temporary account failure and recovers on refresh without disconnecting", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                jsonResponse(
                    {
                        error: {
                            code: "UNAVAILABLE",
                            message: "Temporarily unavailable",
                        },
                    },
                    { status: 503 },
                ),
            )
            .mockResolvedValueOnce(jsonResponse({ pollenBudget: 5 }));
        const logout = vi.fn();
        const value = authValue({ logout });
        let key: UseAccountKeyValue | null = null;
        function Probe() {
            key = useAccountKey();
            return null;
        }
        let renderer: ReactTestRenderer;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={value}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });
        await waitFor(() => !!key?.error);
        expect(read<UseAccountKeyValue>(key).data).toBeNull();
        expect(logout).not.toHaveBeenCalled();
        await act(async () => {
            await read<UseAccountKeyValue>(key).refresh();
        });
        expect(read<UseAccountKeyValue>(key).error).toBeNull();
        expect(read<UseAccountKeyValue>(key).data?.pollenBudget).toBe(5);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(logout).not.toHaveBeenCalled();
        await act(async () => renderer.unmount());
    });

    it.each([
        [
            "a 5xx",
            () => Promise.resolve(jsonResponse({}, { status: 500 })),
            500,
        ],
        [
            "a network failure",
            () => Promise.reject(new TypeError("Failed to fetch")),
            0,
        ],
    ])(
        "retries %s on its own until Pollinations is back",
        async (_name, fail, status) => {
            vi.useFakeTimers();
            const fetchMock = vi
                .spyOn(globalThis, "fetch")
                .mockImplementationOnce(fail)
                .mockResolvedValueOnce(jsonResponse({ pollenBudget: 5 }));
            let key: UseAccountKeyValue | null = null;
            function Probe() {
                key = useAccountKey();
                return null;
            }
            let renderer: ReactTestRenderer;
            await act(async () => {
                renderer = create(
                    <AuthContext.Provider value={authValue()}>
                        <Probe />
                    </AuthContext.Provider>,
                );
            });
            await waitFor(() => !!key?.error);
            const { error } = read<UseAccountKeyValue>(key);
            expect(isOutageError(error)).toBe(true);
            expect((error as PollinationsError).status).toBe(status);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(30_000);
            });
            await waitFor(() => key?.data?.pollenBudget === 5);
            expect(read<UseAccountKeyValue>(key).error).toBeNull();
            expect(fetchMock).toHaveBeenCalledTimes(2);
            await act(async () => renderer.unmount());
            vi.useRealTimers();
        },
    );

    it("keeps a 403 as a plain error without retrying", async () => {
        vi.useFakeTimers();
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(jsonResponse({}, { status: 403 }));
        const logout = vi.fn();
        let key: UseAccountKeyValue | null = null;
        function Probe() {
            key = useAccountKey();
            return null;
        }
        let renderer: ReactTestRenderer;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue({ logout })}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });
        await waitFor(() => !!key?.error);
        expect(isOutageError(read<UseAccountKeyValue>(key).error)).toBe(false);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(logout).not.toHaveBeenCalled();
        await act(async () => renderer.unmount());
        vi.useRealTimers();
    });

    it("logs out when an account hook receives 401", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            jsonResponse(
                {
                    error: {
                        code: "UNAUTHORIZED",
                        message: "Invalid API key",
                    },
                },
                { status: 401 },
            ),
        );

        const logout = vi.fn();
        const value = authValue({ logout });
        let auth: AuthStateValue | null = null;
        let key: UseAccountKeyValue | null = null;

        function Probe() {
            auth = useAuthState();
            key = useAccountKey();
            return null;
        }

        await act(async () => {
            create(
                <AuthContext.Provider value={value}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await waitFor(() => logout.mock.calls.length > 0);

        expect(logout).toHaveBeenCalledTimes(1);
        expect(read<AuthStateValue>(auth).apiKey).toBe("sk_test");
        expect(read<UseAccountKeyValue>(key).data).toBeNull();
    });
});

type TextGeneration = ReturnType<typeof useTextGeneration>;

function chatResponse(content: string): Response {
    return jsonResponse({ choices: [{ message: { content } }] }) as Response;
}

/** A fetch that only settles when its signal aborts, like the real one. */
function abortableFetch(_url: unknown, init?: RequestInit): Promise<Response> {
    return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
        );
    });
}

async function mountTextGeneration(initial: AuthContextValue) {
    const probe: { gen?: TextGeneration } = {};
    function Probe() {
        probe.gen = useTextGeneration();
        return null;
    }
    const element = (value: AuthContextValue) => (
        <AuthContext.Provider value={value}>
            <Probe />
        </AuthContext.Provider>
    );
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
        renderer = create(element(initial));
    });
    return {
        gen: () => read(probe.gen ?? null),
        update: (value: AuthContextValue) =>
            act(async () => {
                renderer?.update(element(value));
            }),
        unmount: () =>
            act(async () => {
                renderer?.unmount();
            }),
    };
}

describe("generation hooks", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("runs a request with the provider key and exposes the result", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(chatResponse("hello"));
        const { gen } = await mountTextGeneration(authValue());

        await act(async () => {
            await gen().run("say hello");
        });

        expect(gen().data).toBe("hello");
        expect(gen().error).toBeNull();
        expect(gen().isLoading).toBe(false);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://gen.pollinations.ai/v1/chat/completions",
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: "Bearer sk_test",
                }),
            }),
        );
    });

    it("cancel aborts the request without an error", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(abortableFetch);
        const { gen } = await mountTextGeneration(authValue());

        let pending: Promise<void> = Promise.resolve();
        await act(async () => {
            pending = gen().run("slow");
        });
        expect(gen().isLoading).toBe(true);
        await act(async () => {
            gen().cancel();
            await pending;
        });

        const signal = fetchMock.mock.calls[0]?.[1]?.signal;
        expect(signal?.aborted).toBe(true);
        expect(gen().isLoading).toBe(false);
        expect(gen().error).toBeNull();
        expect(gen().data).toBeNull();
    });

    it("a re-run supersedes the request in flight", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(abortableFetch)
            .mockResolvedValueOnce(chatResponse("second"));
        const { gen } = await mountTextGeneration(authValue());

        await act(async () => {
            const first = gen().run("first");
            await Promise.resolve();
            await gen().run("second");
            await first;
        });

        expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
        expect(gen().data).toBe("second");
        expect(gen().isLoading).toBe(false);
    });

    it("rerun repeats the last arguments", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(chatResponse("again"));
        const { gen } = await mountTextGeneration(authValue());

        await act(async () => {
            await gen().run("same prompt");
            await gen().rerun();
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
            fetchMock.mock.calls[1]?.[1]?.body,
        );
        expect(gen().data).toBe("again");
    });

    it("a key change clears the previous result", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(chatResponse("mine"));
        const { gen, update } = await mountTextGeneration(authValue());
        await act(async () => {
            await gen().run("hi");
        });
        expect(gen().data).toBe("mine");

        await update(authValue({ apiKey: "sk_other" }));

        expect(gen().data).toBeNull();
        expect(gen().error).toBeNull();
    });

    it("a key change drops the response of the request in flight", async () => {
        let settle: (response: Response) => void = () => {};
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
            () =>
                new Promise<Response>((resolve) => {
                    settle = resolve;
                }),
        );
        const { gen, update } = await mountTextGeneration(authValue());
        await act(async () => {
            void gen().run("private");
            await Promise.resolve();
        });

        await update(authValue({ apiKey: "sk_other" }));
        await act(async () => {
            settle(chatResponse("previous user's answer"));
            await Promise.resolve();
        });

        expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
        expect(gen().data).toBeNull();
        expect(gen().isLoading).toBe(false);
    });

    it("unmounting aborts the request in flight", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(abortableFetch);
        const { gen, unmount } = await mountTextGeneration(authValue());
        await act(async () => {
            void gen().run("slow");
            await Promise.resolve();
        });

        await unmount();

        expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    });

    it("sets an error and sends nothing when logged out", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");
        const { gen } = await mountTextGeneration(
            authValue({ apiKey: null, isLoggedIn: false }),
        );

        await act(async () => {
            await gen().run("hi");
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(gen().error?.message).toBe("Log in to Pollinations to generate");
    });

    it("logs out when a generation receives 401", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            jsonResponse(
                { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
                { status: 401 },
            ),
        );
        const logout = vi.fn();
        const { gen } = await mountTextGeneration(authValue({ logout }));

        await act(async () => {
            await gen().run("hi");
        });

        expect(logout).toHaveBeenCalledTimes(1);
        expect(gen().data).toBeNull();
    });
});
