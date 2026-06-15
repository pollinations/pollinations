import { useEffect, useRef, useSyncExternalStore } from "react";
import {
    EMBED_MESSAGE_SOURCE,
    type HostCapabilities,
    validateHostMessage,
} from "./embed-protocol.js";
import { useAuthActions } from "./hooks.js";

// Module-level external store: the EmbedBridge writes the validated host's
// capabilities here; UI (AppUserMenu) reads them via the hook below.
let hostCapabilities: HostCapabilities | null = null;
const capabilityListeners = new Set<() => void>();

function setHostCapabilities(next: HostCapabilities | null): void {
    if (next === hostCapabilities) return;
    if (
        next &&
        hostCapabilities &&
        next.authControl === hostCapabilities.authControl
    ) {
        return; // unchanged — avoid spurious notifies
    }
    hostCapabilities = next;
    for (const listener of capabilityListeners) listener();
}

function subscribeCapabilities(listener: () => void): () => void {
    capabilityListeners.add(listener);
    return () => {
        capabilityListeners.delete(listener);
    };
}

/**
 * The validated embedding host's capabilities, or `null` when the app is not
 * embedded under a trusted Pollinations host. `AppUserMenu` reads this to hide
 * its own controls — the host renders the account menu in its chrome.
 */
export function useEmbedHostCapabilities(): HostCapabilities | null {
    return useSyncExternalStore(
        subscribeCapabilities,
        () => hostCapabilities,
        () => null,
    );
}

// Test-only hook into the store (not part of the public surface).
export function __setHostCapabilitiesForTest(
    next: HostCapabilities | null,
): void {
    setHostCapabilities(next);
}

// Set by the bridge on a successful handshake; read by `PolliProvider.login()`
// so that an in-app login under a trusted host asks the host to log in
// (top-level) instead of redirecting the iframe — which GitHub blocks.
let embedHostOrigin: string | null = null;

/**
 * If the app is embedded under a trusted host, ask the host to run login
 * (top-level) via `postMessage` and return `true`. Otherwise return `false` so
 * the caller falls back to its normal redirect login.
 */
export function requestHostLogin(): boolean {
    if (!embedHostOrigin || typeof window === "undefined") return false;
    window.parent.postMessage(
        { source: EMBED_MESSAGE_SOURCE, type: "login-request" },
        embedHostOrigin,
    );
    return true;
}

function devLoopback(): boolean {
    try {
        const h = window.location.hostname;
        return h === "localhost" || h === "127.0.0.1";
    } catch {
        return false;
    }
}

/**
 * Always mounted by `PolliProvider`. Reports its content height to the parent
 * whenever embedded (cosmetic, no handshake needed). For auth it stays inert
 * until a trusted host completes the handshake — then it adopts the host's
 * borrowed API key (`setApiKey`) and flags the embed-host so `login()` reroutes
 * to the host. Renders nothing.
 */
export function EmbedBridge(): null {
    const { setApiKey } = useAuthActions();
    const hostOriginRef = useRef<string | null>(null);
    // Keep the latest setter in a ref so the message listener mounts once.
    const setApiKeyRef = useRef(setApiKey);
    setApiKeyRef.current = setApiKey;

    // Handshake + key push (mount once). Capture the window up front so cleanup
    // is robust if the global is torn down (test teardown / unmount).
    useEffect(() => {
        if (typeof window === "undefined" || window.parent === window) return;
        const target = window;
        // No listener API (SSR-ish / partial environment) → nothing to wire up.
        if (typeof target.addEventListener !== "function") return;
        const onMessage = (event: MessageEvent) => {
            const msg = validateHostMessage(
                {
                    origin: event.origin,
                    source: event.source,
                    data: event.data,
                },
                { parentWindow: target.parent, allowLoopback: devLoopback() },
            );
            if (!msg) return;
            if (msg.type === "host-hello") {
                // The host must advertise that it manages the account control,
                // else the app keeps its own menu and stays standalone.
                if (!msg.capabilities.authControl) return;
                hostOriginRef.current = event.origin;
                embedHostOrigin = event.origin;
                setHostCapabilities(msg.capabilities);
                // Ack so the host stops its host-hello retry.
                target.parent.postMessage(
                    { source: EMBED_MESSAGE_SOURCE, type: "app-ready" },
                    event.origin,
                );
                return;
            }
            // The key push only counts after a handshake, and only from the host
            // that handshook (a different trusted origin must not drive this app).
            if (
                !hostOriginRef.current ||
                event.origin !== hostOriginRef.current
            ) {
                return;
            }
            if (msg.type === "auth") {
                // Adopt the host's borrowed key (or clear it on null = host logout).
                setApiKeyRef.current(msg.apiKey);
            }
        };
        target.addEventListener("message", onMessage);
        return () => {
            target.removeEventListener("message", onMessage);
            setHostCapabilities(null);
            embedHostOrigin = null;
        };
    }, []);

    // Report content height to the embedding host whenever embedded, so it can
    // size the iframe to fit. Cosmetic and independent of the auth handshake, so
    // it posts to "*" (the host validates the sender's origin on its side) and
    // runs even before a host-hello. Guarded — node/test env has no DOM.
    useEffect(() => {
        if (typeof window === "undefined" || window.parent === window) return;
        if (
            typeof ResizeObserver === "undefined" ||
            typeof document === "undefined"
        ) {
            return;
        }
        const report = () => {
            window.parent.postMessage(
                {
                    source: EMBED_MESSAGE_SOURCE,
                    type: "height",
                    value: Math.ceil(document.documentElement.scrollHeight),
                },
                "*",
            );
        };
        const observer = new ResizeObserver(report);
        observer.observe(document.body);
        report();
        return () => observer.disconnect();
    }, []);

    return null;
}
