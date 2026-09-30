/**
 * WISP endpoint management. Browser sandboxes cannot open external TCP
 * sockets, so the Pi agent's HTTPS traffic to gen.pollinations.ai is tunneled
 * through a WISP server (TCP-over-WebSocket) that the user provides.
 *
 * Three ways to get an endpoint (mirrors wasmer.sh):
 *  1. One-click deploy of wasmer/wisp-server to the user's free Wasmer
 *     account. The deployed app then opens <our origin>/?endpoint=wss://...
 *     and we pick it up via BroadcastChannel across tabs.
 *  2. Run `wasmer run wasmer/wisp-server --net` locally and paste the URL.
 *  3. Any custom wss:// URL.
 */

const STORAGE_KEY = "pi-browser:wisp-url";
export const WISP_CHANNEL_NAME = "pi-browser:wisp-autoconfigure";
export const LOCAL_WISP_COMMAND = "wasmer run wasmer/wisp-server --net";

export function normalizeWispUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
  return url.href;
}

export function readStoredWispUrl(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)?.trim();
    return stored ? normalizeWispUrl(stored) : null;
  } catch {
    return null;
  }
}

export function storeWispUrl(value: string): string | null {
  const normalized = normalizeWispUrl(value);
  if (!normalized) return null;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    /* private mode — memory only */
  }
  return normalized;
}

export function clearStoredWispUrl(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** The URL that receives the deployed wisp-server's autoconfigure ping. */
export function wispAutoconfigureUrl(): string {
  return `${window.location.origin}/`;
}

/** Wasmer one-click deploy URL for wasmer/wisp-server. */
export function createWispDeploymentUrl(): string {
  const autoconfigure = encodeURIComponent(wispAutoconfigureUrl());
  return `https://wasmer.io/apps/create?package=wasmer/wisp-server&env%5BWISP_AUTOCONFIGURE%5D=${autoconfigure}`;
}

/**
 * Read ?endpoint=... from the current URL (the wisp-server deploy flow opens
 * our page with it in a new tab). Returns a cleaned URL or null.
 */
export function wispUrlFromLocation(): { url: string; cleanUp: () => void } | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("endpoint");
  if (!raw) return null;
  const url = normalizeWispUrl(raw);
  const cleanUp = () => {
    const current = new URL(window.location.href);
    current.search = "";
    window.history.replaceState({}, "", current);
  };
  return url ? { url, cleanUp } : { url: "", cleanUp };
}

/** Cross-tab listener used by the autoconfigure flow. */
export function listenForWispAutoconfigure(
  onEndpoint: (url: string) => void
): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(WISP_CHANNEL_NAME);
  } catch {
    return () => undefined;
  }
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; version?: number; endpoint?: string };
    if (data?.type === "wisp-autoconfigure" && data.version === 1 && data.endpoint) {
      const url = normalizeWispUrl(data.endpoint);
      if (url) onEndpoint(url);
    }
  };
  return () => channel?.close();
}

/** Announce an endpoint to other tabs of this origin (used by the receiver tab). */
export function broadcastWispEndpoint(url: string): void {
  try {
    const channel = new BroadcastChannel(WISP_CHANNEL_NAME);
    channel.postMessage({ type: "wisp-autoconfigure", version: 1, endpoint: url });
    channel.close();
  } catch {
    /* ignore */
  }
}
