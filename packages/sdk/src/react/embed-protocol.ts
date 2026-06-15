// Wire protocol for the /play embed bridge (host-shared auth). Pure + DOM-free
// so the security-critical trust gate is unit-tested without faking a browser.
// React/DOM glue lives in embed.tsx.
//
// Model: the host (the website) logs in top-level and pushes its API key DOWN
// into the embedded app. The key crosses the boundary deliberately, so the trust
// gate must be tight — only the genuine embedding host may push it.

export const EMBED_MESSAGE_SOURCE = "polli-embed" as const;

// Exact trusted host origins — NOT a *.pollinations.ai suffix. The gate controls
// who may push the shared API key into the app, so it must be tight. Loopback is
// dev-only (allowLoopback).
export const TRUSTED_HOST_ORIGINS: readonly string[] = [
    "https://pollinations.ai",
    "https://staging.pollinations.ai",
];

export interface TrustOptions {
    /** Allow any-port http://localhost / http://127.0.0.1 (dev only). */
    allowLoopback?: boolean;
    /** Override the built-in exact origins (tests / future config). */
    trustedOrigins?: readonly string[];
}

export function isTrustedHostOrigin(
    origin: string,
    opts: TrustOptions = {},
): boolean {
    const list = opts.trustedOrigins ?? TRUSTED_HOST_ORIGINS;
    if (list.includes(origin)) return true;
    if (opts.allowLoopback) {
        try {
            const { protocol, hostname } = new URL(origin);
            return (
                protocol === "http:" &&
                (hostname === "localhost" || hostname === "127.0.0.1")
            );
        } catch {
            return false;
        }
    }
    return false;
}

export interface HostCapabilities {
    /** Host renders the account control in its own chrome → app hides its own. */
    authControl: boolean;
}

// host -> app
export type HostToAppMessage =
    | {
          source: typeof EMBED_MESSAGE_SOURCE;
          type: "host-hello";
          capabilities: HostCapabilities;
      }
    | {
          source: typeof EMBED_MESSAGE_SOURCE;
          type: "auth";
          /** The host's API key, lent to the app. `null` = host signed out. */
          apiKey: string | null;
      };

// (App -> host messages — app-ready / height / login-request — are built inline
// in embed.tsx; the host re-declares its own view, so no shared type is needed.)

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function parseHostMessage(data: unknown): HostToAppMessage | null {
    if (!isRecord(data)) return null;
    if (data.source !== EMBED_MESSAGE_SOURCE) return null;
    if (data.type === "host-hello") {
        const caps = data.capabilities;
        if (!isRecord(caps) || typeof caps.authControl !== "boolean")
            return null;
        return {
            source: EMBED_MESSAGE_SOURCE,
            type: "host-hello",
            capabilities: { authControl: caps.authControl },
        };
    }
    if (data.type === "auth") {
        const { apiKey } = data;
        if (apiKey !== null && typeof apiKey !== "string") return null;
        return { source: EMBED_MESSAGE_SOURCE, type: "auth", apiKey };
    }
    return null;
}

export interface IncomingEvent {
    origin: string;
    source: unknown;
    data: unknown;
}

// Full trust gate for an incoming host->app message: exact origin AND the event
// must originate from our actual parent window. Pure — caller supplies the ref.
export function validateHostMessage(
    event: IncomingEvent,
    ctx: { parentWindow: unknown } & TrustOptions,
): HostToAppMessage | null {
    if (!isTrustedHostOrigin(event.origin, ctx)) return null;
    if (event.source !== ctx.parentWindow) return null;
    return parseHostMessage(event.data);
}
