import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "./contexts.js";
import {
    __setHostCapabilitiesForTest,
    EmbedBridge,
    requestHostLogin,
    useEmbedHostCapabilities,
} from "./embed.js";
import { EMBED_MESSAGE_SOURCE } from "./embed-protocol.js";
import { useAuthActions } from "./hooks.js";
import { PolliProvider } from "./PolliProvider.js";
import type { StorageAdapter } from "./storage.js";

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
    __setHostCapabilitiesForTest(null);
});

function Probe({ onValue }: { onValue: (v: unknown) => void }) {
    onValue(useEmbedHostCapabilities());
    return null;
}

describe("useEmbedHostCapabilities", () => {
    it("starts null and tracks the capability store", () => {
        const seen: unknown[] = [];
        act(() => {
            renderer = create(<Probe onValue={(v) => seen.push(v)} />);
        });
        expect(seen.at(-1)).toBeNull();

        act(() => __setHostCapabilitiesForTest({ authControl: true }));
        expect(seen.at(-1)).toEqual({ authControl: true });
    });
});

const PARENT = {
    postMessage: vi.fn(),
};

function stubEmbedWindow() {
    const handlers: Record<string, ((e: unknown) => void)[]> = {};
    const win = {
        parent: PARENT,
        self: {} as unknown,
        top: {} as unknown, // self !== top → looks embedded (not used by gate, but realistic)
        // Full enough for PolliProvider's mount-time hydration as well.
        location: {
            href: "https://websim.pollinations.ai/",
            origin: "https://websim.pollinations.ai",
            protocol: "https:",
            hostname: "websim.pollinations.ai",
            pathname: "/",
            hash: "",
            search: "",
        },
        history: { replaceState: vi.fn() },
        addEventListener: (type: string, fn: (e: unknown) => void) => {
            handlers[type] ??= [];
            handlers[type].push(fn);
        },
        removeEventListener: (type: string, fn: (e: unknown) => void) => {
            handlers[type] = (handlers[type] ?? []).filter((h) => h !== fn);
        },
    };
    vi.stubGlobal("window", win);
    // ResizeObserver + document are optional; EmbedBridge guards their absence.
    return {
        emit: (event: unknown) => {
            for (const fn of handlers.message ?? []) fn(event);
        },
    };
}

// Minimal in-memory storage (mirrors PolliProvider.test) for a clean provider mount.
function memoryStorage(): StorageAdapter {
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value);
        },
        removeItem: (key) => {
            values.delete(key);
        },
    };
}

function authContext(over: Partial<AuthContextValue> = {}): AuthContextValue {
    return {
        apiKey: null,
        isLoggedIn: false,
        isHydrated: true,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        setApiKey: vi.fn(),
        enterUrl: "https://enter.pollinations.ai",
        apiBaseUrl: "https://enter.pollinations.ai/api",
        ...over,
    };
}

const hostHello = {
    origin: "https://pollinations.ai",
    source: PARENT,
    data: {
        source: EMBED_MESSAGE_SOURCE,
        type: "host-hello",
        capabilities: { authControl: true },
    },
};

function authMessage(apiKey: string | null) {
    return {
        origin: "https://pollinations.ai",
        source: PARENT,
        data: { source: EMBED_MESSAGE_SOURCE, type: "auth", apiKey },
    };
}

describe("EmbedBridge", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        PARENT.postMessage.mockClear();
        __setHostCapabilitiesForTest(null);
    });

    it("acks app-ready and publishes capabilities on a trusted host-hello", () => {
        const win = stubEmbedWindow();
        act(() => {
            renderer = create(
                <AuthContext.Provider value={authContext()}>
                    <EmbedBridge />
                </AuthContext.Provider>,
            );
        });

        act(() => win.emit(hostHello));

        expect(PARENT.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                source: EMBED_MESSAGE_SOURCE,
                type: "app-ready",
            }),
            "https://pollinations.ai",
        );

        const seen: unknown[] = [];
        act(() => {
            create(<Probe onValue={(v) => seen.push(v)} />);
        });
        expect(seen.at(-1)).toEqual({ authControl: true });
    });

    it("ignores an untrusted host-hello", () => {
        const win = stubEmbedWindow();
        act(() => {
            renderer = create(
                <AuthContext.Provider value={authContext()}>
                    <EmbedBridge />
                </AuthContext.Provider>,
            );
        });
        act(() => win.emit({ ...hostHello, origin: "https://evil.com" }));
        expect(PARENT.postMessage).not.toHaveBeenCalled();
    });

    it("ignores a host-hello that disclaims authControl", () => {
        const win = stubEmbedWindow();
        act(() => {
            renderer = create(
                <AuthContext.Provider value={authContext()}>
                    <EmbedBridge />
                </AuthContext.Provider>,
            );
        });
        act(() =>
            win.emit({
                origin: "https://pollinations.ai",
                source: PARENT,
                data: {
                    source: EMBED_MESSAGE_SOURCE,
                    type: "host-hello",
                    capabilities: { authControl: false },
                },
            }),
        );
        expect(PARENT.postMessage).not.toHaveBeenCalled();
    });

    it("adopts the host's borrowed apiKey on a trusted auth message", () => {
        const win = stubEmbedWindow();
        const ctx = authContext();
        act(() => {
            renderer = create(
                <AuthContext.Provider value={ctx}>
                    <EmbedBridge />
                </AuthContext.Provider>,
            );
        });
        act(() => win.emit(hostHello));
        act(() => win.emit(authMessage("sk_borrowed")));
        expect(ctx.setApiKey).toHaveBeenCalledWith("sk_borrowed");
    });

    it("clears the key on auth null (host signed out)", () => {
        const win = stubEmbedWindow();
        const ctx = authContext();
        act(() => {
            renderer = create(
                <AuthContext.Provider value={ctx}>
                    <EmbedBridge />
                </AuthContext.Provider>,
            );
        });
        act(() => win.emit(hostHello));
        act(() => win.emit(authMessage(null)));
        expect(ctx.setApiKey).toHaveBeenLastCalledWith(null);
    });

    it("ignores an auth message received before a handshake", () => {
        const win = stubEmbedWindow();
        const ctx = authContext();
        act(() => {
            renderer = create(
                <AuthContext.Provider value={ctx}>
                    <EmbedBridge />
                </AuthContext.Provider>,
            );
        });
        act(() => win.emit(authMessage("sk_borrowed")));
        expect(ctx.setApiKey).not.toHaveBeenCalled();
    });

    it("reports height to '*' whenever embedded, without a handshake", () => {
        stubEmbedWindow();
        // Height is pure DOM transport, so it needs document + ResizeObserver.
        vi.stubGlobal("document", {
            documentElement: { scrollHeight: 1500 },
            body: {},
        });
        class FakeResizeObserver {
            observe() {}
            disconnect() {}
        }
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);

        act(() => {
            renderer = create(
                <AuthContext.Provider value={authContext()}>
                    <EmbedBridge />
                </AuthContext.Provider>,
            );
        });

        // No host-hello was emitted — height is decoupled from auth, and goes
        // to "*" (the host re-validates the sender origin on its side).
        expect(PARENT.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                source: EMBED_MESSAGE_SOURCE,
                type: "height",
                value: 1500,
            }),
            "*",
        );
    });

    it("requestHostLogin posts login-request after handshake, false before", () => {
        const win = stubEmbedWindow();
        act(() => {
            renderer = create(
                <AuthContext.Provider value={authContext()}>
                    <EmbedBridge />
                </AuthContext.Provider>,
            );
        });
        expect(requestHostLogin()).toBe(false); // no host yet
        act(() => win.emit(hostHello));
        expect(requestHostLogin()).toBe(true);
        expect(PARENT.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                source: EMBED_MESSAGE_SOURCE,
                type: "login-request",
            }),
            "https://pollinations.ai",
        );
    });
});

describe("login() is embed-aware", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        PARENT.postMessage.mockClear();
    });

    it("reroutes login to the host when embedded (no iframe redirect)", () => {
        const win = stubEmbedWindow();
        let login: (() => void) | null = null;
        function Grab() {
            login = useAuthActions().login;
            return null;
        }
        act(() => {
            renderer = create(
                <PolliProvider appKey="pk_test" storage={memoryStorage()}>
                    <Grab />
                </PolliProvider>,
            );
        });
        act(() => win.emit(hostHello)); // handshake → embed-host recorded
        const hrefBefore = window.location.href;
        PARENT.postMessage.mockClear();
        act(() => login?.());
        // No iframe redirect; instead a login-request to the host.
        expect(window.location.href).toBe(hrefBefore);
        expect(PARENT.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                source: EMBED_MESSAGE_SOURCE,
                type: "login-request",
            }),
            "https://pollinations.ai",
        );
    });
});

describe("PolliProvider keeps the session frame-local when embedded", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        PARENT.postMessage.mockClear();
    });

    it("never touches the app's own storage on a host auth(null) (can't wipe a standalone session)", () => {
        const win = stubEmbedWindow(); // framed: window.parent = PARENT !== window
        const spy: StorageAdapter = {
            getItem: vi.fn(() => "sk_standalone"),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        };
        act(() => {
            renderer = create(
                <PolliProvider appKey="pk_test" storage={spy}>
                    <div />
                </PolliProvider>,
            );
        });
        act(() => win.emit(hostHello));
        act(() => win.emit(authMessage(null))); // host is logged out

        // Framed → provider uses frame-local memory, so the real adapter passed
        // in is never read, written, or cleared — the standalone session stands.
        expect(spy.getItem).not.toHaveBeenCalled();
        expect(spy.setItem).not.toHaveBeenCalled();
        expect(spy.removeItem).not.toHaveBeenCalled();
    });
});

describe("PolliProvider auto-wires the embed bridge", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        PARENT.postMessage.mockClear();
    });

    it("acks a trusted host-hello without any app-level embed code", () => {
        const win = stubEmbedWindow();
        act(() => {
            renderer = create(
                <PolliProvider appKey="pk_test" storage={memoryStorage()}>
                    <div />
                </PolliProvider>,
            );
        });
        act(() => win.emit(hostHello));
        expect(PARENT.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: "app-ready" }),
            "https://pollinations.ai",
        );
    });
});
