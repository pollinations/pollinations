import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "./contexts.js";
import { useText } from "./generation.js";

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

function chatResponse(content: string): Response {
    return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: async () => ({ choices: [{ message: { content } }] }),
    } as Response;
}

async function waitFor(condition: () => boolean) {
    for (let i = 0; i < 50; i++) {
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

function deferredFetch(): {
    fetchMock: ReturnType<typeof vi.spyOn>;
    release: (v: Response) => void;
} {
    let release = (_v: Response) => {
        throw new Error("fetch not called yet");
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
        return new Promise<Response>((resolve) => {
            release = resolve;
        });
    });
    return {
        fetchMock,
        release: (v: Response) => release(v),
    };
}

describe("generation hooks", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("runs text generation with the provider key", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(chatResponse("hi"));
        let latest: ReturnType<typeof useText> | null = null;
        function Probe() {
            latest = useText();
            return null;
        }
        let renderer: ReactTestRenderer | null = null;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue()}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });
        await act(async () => {
            await read(latest).run("hello");
        });
        await waitFor(() => read(latest).data === "hi");
        expect(read(latest).isLoading).toBe(false);
        expect(read(latest).error).toBeNull();
        const call = fetchMock.mock.calls[0] as [string, RequestInit];
        expect((call[1].headers as Record<string, string>).Authorization).toBe(
            "Bearer sk_test",
        );
        await act(async () => {
            read(renderer).unmount();
        });
    });

    it("cancel stops loading without error", async () => {
        const { fetchMock, release } = deferredFetch();
        let latest: ReturnType<typeof useText> | null = null;
        function Probe() {
            latest = useText();
            return null;
        }
        let renderer: ReactTestRenderer | null = null;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue()}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });
        let pending: Promise<unknown> = Promise.resolve();
        await act(async () => {
            pending = read(latest).run("hello");
        });
        expect(read(latest).isLoading).toBe(true);
        await act(async () => {
            read(latest).cancel();
        });
        expect(read(latest).isLoading).toBe(false);
        expect(read(latest).error).toBeNull();
        expect(read(latest).data).toBeNull();
        // A late resolve must stay ignored.
        await act(async () => {
            release(chatResponse("late"));
            await pending;
        });
        expect(read(latest).data).toBeNull();
        expect(fetchMock).toHaveBeenCalledOnce();
        await act(async () => {
            read(renderer).unmount();
        });
    });

    it("key rotation drops the in-flight run for the old key", async () => {
        const { release } = deferredFetch();
        let latest: ReturnType<typeof useText> | null = null;
        function Probe() {
            latest = useText();
            return null;
        }
        let renderer: ReactTestRenderer | null = null;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue({ apiKey: "sk_old" })}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });
        let pending: Promise<unknown> = Promise.resolve();
        await act(async () => {
            pending = read(latest).run("hello");
        });
        // Rotate the key mid-flight: the old run must not land.
        await act(async () => {
            read(renderer).update(
                <AuthContext.Provider value={authValue({ apiKey: "sk_new" })}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });
        await act(async () => {
            release(chatResponse("stale"));
            await pending;
        });
        expect(read(latest).data).toBeNull();
        expect(read(latest).isLoading).toBe(false);
        await act(async () => {
            read(renderer).unmount();
        });
    });

    it("reports a login error when there is no key", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");
        let latest: ReturnType<typeof useText> | null = null;
        function Probe() {
            latest = useText();
            return null;
        }
        let renderer: ReactTestRenderer | null = null;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue({ apiKey: null })}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });
        await act(async () => {
            await read(latest).run("hello");
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(read(latest).data).toBeNull();
        expect(read(latest).error?.message).toMatch(/log/i);
        await act(async () => {
            read(renderer).unmount();
        });
    });
});
