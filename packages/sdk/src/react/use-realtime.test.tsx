import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "./contexts.js";
import {
    type UseRealtimeSessionValue,
    useRealtimeSession,
} from "./use-realtime.js";

/** A WebSocket stand-in the test drives by hand. */
class FakeSocket {
    static instances: FakeSocket[] = [];
    readonly listeners = new Map<string, Set<(event: unknown) => void>>();
    readonly sent: string[] = [];
    closed = false;
    readyState = 1;

    constructor(readonly url: string) {
        FakeSocket.instances.push(this);
    }

    addEventListener(type: string, handler: (event: unknown) => void): void {
        const handlers = this.listeners.get(type) ?? new Set();
        handlers.add(handler);
        this.listeners.set(type, handlers);
    }

    send(payload: string): void {
        this.sent.push(payload);
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.emit("close", { code: 1000, reason: "" });
    }

    emit(type: string, event: unknown): void {
        for (const handler of this.listeners.get(type) ?? []) handler(event);
    }

    open(): void {
        this.emit("open", {});
    }

    message(event: unknown): void {
        this.emit("message", { data: JSON.stringify(event) });
    }
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

async function mount(
    value: AuthContextValue,
    options?: Record<string, unknown>,
) {
    let latest: UseRealtimeSessionValue | null = null;
    function Probe() {
        latest = useRealtimeSession(options);
        return null;
    }
    const element = (next: AuthContextValue) => (
        <AuthContext.Provider value={next}>
            <Probe />
        </AuthContext.Provider>
    );
    let renderer: ReactTestRenderer | null = null;
    await act(async () => {
        renderer = create(element(value));
    });
    return {
        get: () => read(latest),
        rerender: (next: AuthContextValue) =>
            act(async () => {
                renderer?.update(element(next));
            }),
    };
}

afterEach(() => {
    FakeSocket.instances = [];
    vi.restoreAllMocks();
});

describe("useRealtimeSession", () => {
    it("connects with the signed-in key and surfaces events", async () => {
        (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
        const mounted = await mount(authValue());
        const hook = mounted.get();
        expect(hook.status).toBe("idle");

        await act(async () => {
            void hook.connect();
        });
        expect(mounted.get().status).toBe("connecting");

        const socket = FakeSocket.instances[0];
        expect(socket.url).toContain("key=sk_test");
        await act(async () => {
            socket.open();
            await Promise.resolve();
        });

        expect(mounted.get().status).toBe("connected");
        expect(mounted.get().session).not.toBeNull();

        await act(async () => {
            socket.message({
                type: "response.audio_transcript.delta",
                delta: "hi",
            });
        });
        expect(mounted.get().lastEvent?.delta).toBe("hi");
        expect(mounted.get().events).toHaveLength(1);
    });

    it("reports an error and recovers when the socket fails to open", async () => {
        (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
        const mounted = await mount(authValue());

        await act(async () => {
            void mounted.get().connect();
        });
        const failed = FakeSocket.instances[0];

        await act(async () => {
            failed.emit("error", {});
            await Promise.resolve();
        });

        expect(mounted.get().status).toBe("error");
        expect(mounted.get().error?.message).toMatch(/could not be opened/);
        expect(failed.closed).toBe(true);
    });

    it("closes the session and clears events on disconnect", async () => {
        (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
        const mounted = await mount(authValue());

        await act(async () => {
            void mounted.get().connect();
        });
        const socket = FakeSocket.instances[0];
        await act(async () => {
            socket.open();
            await Promise.resolve();
        });
        await act(async () => {
            socket.message({
                type: "response.done",
                response: { status: "completed" },
            });
        });
        expect(mounted.get().events).toHaveLength(1);

        await act(async () => {
            mounted.get().disconnect();
        });
        expect(socket.closed).toBe(true);
        expect(mounted.get().status).toBe("idle");
        expect(mounted.get().events).toEqual([]);
    });

    it("closes the session in flight when the user logs out", async () => {
        (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
        const value = authValue();
        const mounted = await mount(value);

        await act(async () => {
            void mounted.get().connect();
        });
        const socket = FakeSocket.instances[0];
        await act(async () => {
            socket.open();
            await Promise.resolve();
        });
        expect(mounted.get().status).toBe("connected");

        await mounted.rerender(authValue({ apiKey: null, isLoggedIn: false }));

        expect(socket.closed).toBe(true);
        expect(mounted.get().session).toBeNull();
    });

    it("reports a missing key instead of opening a socket", async () => {
        (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
        const mounted = await mount(
            authValue({ apiKey: null, isLoggedIn: false }),
        );

        await act(async () => {
            await mounted.get().connect();
        });

        expect(FakeSocket.instances).toHaveLength(0);
        expect(mounted.get().status).toBe("error");
        expect(mounted.get().error?.message).toMatch(/Log in/);
    });
});

describe("useRealtimeSession model option", () => {
    it("passes the model through to the session url", async () => {
        (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
        const mounted = await mount(authValue(), {
            model: "openai/gpt-live-transcribe",
        });

        await act(async () => {
            void mounted.get().connect();
        });
        await waitFor(() => FakeSocket.instances.length > 0);
        expect(FakeSocket.instances[0].url).toContain(
            "model=openai%2Fgpt-live-transcribe",
        );
    });
});
