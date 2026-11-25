import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebSocketLike } from "../realtime.js";
import { AuthContext, type AuthContextValue } from "./contexts.js";
import { type UseRealtimeValue, useRealtime } from "./useRealtime.js";

class MockHookSocket implements WebSocketLike {
    static instances: MockHookSocket[] = [];
    readyState = 0;
    closed = false;
    private listeners = new Map<string, Set<(event: unknown) => void>>();

    constructor(public url: string) {
        MockHookSocket.instances.push(this);
    }

    addEventListener(
        type: "open" | "message" | "error" | "close",
        listener: (event: unknown) => void,
    ) {
        let set = this.listeners.get(type);
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        set.add(listener);
    }

    removeEventListener(
        type: "open" | "message" | "error" | "close",
        listener: (event: unknown) => void,
    ) {
        this.listeners.get(type)?.delete(listener);
    }

    send() {}

    close(code = 1000, reason = "") {
        this.closed = true;
        this.readyState = 3;
        this.dispatch("close", { code, reason, wasClean: true });
    }

    dispatch(type: string, event: unknown = {}) {
        if (type === "open") this.readyState = 1;
        for (const fn of this.listeners.get(type) ?? []) fn(event);
    }
}

function read<T>(value: T | null | undefined): T {
    if (!value) throw new Error("Expected hook value");
    return value;
}

function authValue(
    overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
    return {
        apiKey: "sk_hook",
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

describe("useRealtime", () => {
    afterEach(() => {
        MockHookSocket.instances = [];
    });

    it("connects with AuthContext key and closes on unmount", async () => {
        const ref: { current: UseRealtimeValue | null } = { current: null };
        function Probe() {
            ref.current = useRealtime({ WebSocket: MockHookSocket });
            return null;
        }

        let renderer!: ReactTestRenderer;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue()}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        expect(read(ref.current).status).toBe("idle");

        let connectPromise!: Promise<unknown>;
        await act(async () => {
            connectPromise = read(ref.current).connect();
        });
        expect(read(ref.current).status).toBe("connecting");

        const ws = MockHookSocket.instances[0];
        await act(async () => {
            ws.dispatch("open");
            await connectPromise;
        });

        expect(read(ref.current).status).toBe("open");
        expect(read(ref.current).session).not.toBeNull();

        await act(async () => {
            renderer.unmount();
        });
        expect(ws.closed).toBe(true);
    });

    it("closes active session when apiKey changes", async () => {
        let latest: UseRealtimeValue | null = null;
        function Probe() {
            latest = useRealtime({ WebSocket: MockHookSocket });
            return null;
        }

        let renderer!: ReactTestRenderer;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue({ apiKey: "sk_one" })}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await act(async () => {
            const p = latest!.connect();
            MockHookSocket.instances[0].dispatch("open");
            await p;
        });

        expect(MockHookSocket.instances[0].closed).toBe(false);

        await act(async () => {
            renderer.update(
                <AuthContext.Provider value={authValue({ apiKey: "sk_two" })}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        expect(MockHookSocket.instances[0].closed).toBe(true);
    });

    it("sets error state when no secret key is available", async () => {
        const ref: { current: UseRealtimeValue | null } = { current: null };
        function Probe() {
            ref.current = useRealtime({ WebSocket: MockHookSocket });
            return null;
        }

        await act(async () => {
            create(
                <AuthContext.Provider value={authValue({ apiKey: null })}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await act(async () => {
            await expect(read(ref.current).connect()).rejects.toThrow(/required/i);
        });
        expect(read(ref.current).status).toBe("error");
        expect(read(ref.current).error).toBeInstanceOf(Error);
    });
});
