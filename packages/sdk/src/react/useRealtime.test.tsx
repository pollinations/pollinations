import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { AuthContext, type AuthContextValue } from "./contexts.js";
import { type UseRealtimeResult, useRealtime } from "./useRealtime.js";

class MockWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;
    url: string;
    listeners = new Map<string, Set<(evt: unknown) => void>>();

    constructor(url: string) {
        this.url = url;
    }

    addEventListener(type: string, handler: (evt: unknown) => void) {
        let set = this.listeners.get(type);
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        set.add(handler);
    }

    removeEventListener(type: string, handler: (evt: unknown) => void) {
        this.listeners.get(type)?.delete(handler);
    }

    send() {}

    close() {
        this.readyState = MockWebSocket.CLOSED;
        this.listeners.get("close")?.forEach((h) => {
            h({});
        });
    }
}

describe("useRealtime", () => {
    it("inherits apiKey from AuthContext and manages status", () => {
        let capturedHook: UseRealtimeResult | undefined;
        function TestComponent() {
            capturedHook = useRealtime({
                WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
            });
            return null;
        }

        const authValue: Partial<AuthContextValue> = {
            apiKey: "sk_context_key",
            isLoggedIn: true,
            isHydrated: true,
            error: null,
        };

        act(() => {
            create(
                <AuthContext.Provider value={authValue as AuthContextValue}>
                    <TestComponent />
                </AuthContext.Provider>,
            );
        });

        expect(capturedHook?.status).toBe("idle");
        expect(capturedHook?.session).toBeNull();

        act(() => {
            capturedHook?.connect();
        });

        expect(capturedHook?.status).toBe("connecting");
        expect(capturedHook?.session).not.toBeNull();
        expect(capturedHook?.session?.socket.url).toContain("sk_context_key");

        act(() => {
            capturedHook?.disconnect();
        });

        expect(capturedHook?.status).toBe("closed");
    });
});
