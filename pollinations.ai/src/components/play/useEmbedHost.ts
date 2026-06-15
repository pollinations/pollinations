import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import { useColorMode } from "@pollinations/ui";
import {
    type RefObject,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

// Host side of the `polli-embed` contract for /play (host-shared auth). The app
// side lives in `@pollinations/sdk` (auto-wired in PolliProvider). We re-declare
// our small view of the wire format here rather than importing the SDK's types.
const EMBED_SOURCE = "polli-embed";
const HOST_HELLO_ATTEMPTS = 20;
const HOST_HELLO_INTERVAL_MS = 250;
/** Safety cap so a misbehaving app can't request an unbounded iframe. */
const MAX_IFRAME_HEIGHT = 20000;

export type EmbedHost = {
    iframeRef: RefObject<HTMLIFrameElement | null>;
    onLoad: () => void;
    reportedHeight: number | null;
};

/**
 * Drives an embedded /play app under host-shared auth: handshakes, **lends the
 * site's API key down** (so the app is authed without its own login), sizes the
 * iframe to content, syncs theme, and — if the app asks to log in (`login-request`)
 * — runs the site's own top-level login. Reset per `appOrigin`; the handshake
 * re-arms on every iframe load so a post-login reload re-handshakes.
 */
export function useEmbedHost(appOrigin: string): EmbedHost {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [reportedHeight, setReportedHeight] = useState<number | null>(null);
    const readyRef = useRef(false);
    const attemptsRef = useRef(0);
    const { mode } = useColorMode();
    const { apiKey } = useAuthState();
    const { login } = useAuthActions();

    // Latest values in refs so the message listener mounts once per app.
    const apiKeyRef = useRef(apiKey);
    apiKeyRef.current = apiKey;
    const loginRef = useRef(login);
    loginRef.current = login;

    const send = useCallback(
        (message: Record<string, unknown>) => {
            iframeRef.current?.contentWindow?.postMessage(
                { source: EMBED_SOURCE, ...message },
                appOrigin,
            );
        },
        [appOrigin],
    );

    // Reset handshake/height when the embedded app changes.
    // biome-ignore lint/correctness/useExhaustiveDependencies: appOrigin is the reset trigger (body uses only setters/refs), not a read value.
    useEffect(() => {
        readyRef.current = false;
        attemptsRef.current = 0;
        setReportedHeight(null);
    }, [appOrigin]);

    // Listen for app -> host messages (origin + source gated).
    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== appOrigin) return;
            if (event.source !== iframeRef.current?.contentWindow) return;
            const data = event.data as {
                source?: unknown;
                type?: unknown;
                value?: unknown;
            } | null;
            if (!data || data.source !== EMBED_SOURCE) return;
            if (data.type === "app-ready") {
                readyRef.current = true;
                // Lend the current key as soon as the app is listening.
                send({ type: "auth", apiKey: apiKeyRef.current ?? null });
            } else if (
                data.type === "height" &&
                typeof data.value === "number" &&
                Number.isFinite(data.value) &&
                data.value > 0
            ) {
                setReportedHeight(Math.min(data.value, MAX_IFRAME_HEIGHT));
            } else if (data.type === "login-request") {
                // The app (logged out) asked us to log in — do it top-level.
                loginRef.current();
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [appOrigin, send]);

    // Burst host-hello until the app acks (covers the listener-install race);
    // idle once ready. Re-armed by onLoad so a reload re-handshakes.
    useEffect(() => {
        const id = setInterval(() => {
            if (
                readyRef.current ||
                attemptsRef.current >= HOST_HELLO_ATTEMPTS
            ) {
                return;
            }
            attemptsRef.current += 1;
            send({ type: "host-hello", capabilities: { authControl: true } });
        }, HOST_HELLO_INTERVAL_MS);
        return () => clearInterval(id);
    }, [send]);

    // Re-push the key whenever it changes (login/logout), once the app is ready.
    useEffect(() => {
        if (!readyRef.current) return;
        send({ type: "auth", apiKey: apiKey ?? null });
    }, [send, apiKey]);

    // Push the site's current theme into the app (initial paint is cookie-driven).
    useEffect(() => {
        send({ type: "theme", value: mode });
    }, [send, mode]);

    const onLoad = useCallback(() => {
        // New document in the iframe (initial load or post-login reload): re-arm
        // the handshake and re-push theme.
        readyRef.current = false;
        attemptsRef.current = 0;
        send({ type: "host-hello", capabilities: { authControl: true } });
        send({ type: "theme", value: mode });
    }, [send, mode]);

    return { iframeRef, onLoad, reportedHeight };
}
