import { type FC, useSyncExternalStore } from "react";
import { cn } from "../lib/cn.ts";
import { MoonIcon, SunIcon } from "./icons/index.tsx";

/**
 * Light/dark colour mode. The chosen mode is reflected as `class="dark"` on
 * <html>, which flips the design-system tokens (see styles/tokens.css: `.dark`
 * + `.dark [data-theme]`). One shared module-level store backs every
 * `useColorMode()` consumer, so duplicate toggles never desync and changes
 * propagate across tabs.
 *
 * The chosen mode is persisted to BOTH a cookie scoped to the registrable
 * domain — so every `*.pollinations.ai` page reads the same value, including
 * cross-origin embeds like the enter auth screen shown inside /play — AND
 * localStorage, a same-origin mirror that powers the cross-tab `storage` sync
 * below and migrates existing users. Read priority: cookie → localStorage →
 * system preference.
 *
 * Host apps should set the initial class pre-paint (a tiny inline script in the
 * document head, reading the same cookie/key) to avoid a flash of light before
 * React mounts; this store is the source of truth after hydration.
 *
 * Side-effect-free on import: the <html> sync and the cross-tab listener are
 * attached lazily on first subscribe, so importing this module (e.g. via the
 * package barrel) never mutates the DOM on its own.
 */
type ColorMode = "light" | "dark";

const STORAGE_KEY = "polli-color-mode";

function readStored(): ColorMode | null {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        return value === "light" || value === "dark" ? value : null;
    } catch {
        return null;
    }
}

// Persist the mode one year; refreshed on every write.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Cookie domain for cross-subdomain sharing: the registrable domain (last two
 * hostname labels), so e.g. `enter.pollinations.ai` and the website share one
 * value. Returns null for localhost / bare IPs (host-only cookie — already
 * shared across ports). Every host we serve uses a single-label TLD (`.ai`),
 * so last-two-labels equals eTLD+1 — no public-suffix list needed.
 */
function cookieDomain(): string | null {
    if (typeof location === "undefined") return null;
    const host = location.hostname;
    if (host === "localhost" || /^[0-9.]+$/.test(host) || !host.includes(".")) {
        return null;
    }
    return host.split(".").slice(-2).join(".");
}

function readCookie(): ColorMode | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(
        /(?:^|;\s*)polli-color-mode=(light|dark)(?:;|$)/,
    );
    return match ? (match[1] as ColorMode) : null;
}

function writeCookie(mode: ColorMode): void {
    if (typeof document === "undefined" || typeof location === "undefined") {
        return;
    }
    const domain = cookieDomain();
    const secure = location.protocol === "https:" ? "; Secure" : "";
    // biome-ignore lint/suspicious/noDocumentCookie: first-party theme key; Cookie Store API lacks Firefox/older-Safari support
    document.cookie = `${STORAGE_KEY}=${mode}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${
        domain ? `; Domain=${domain}` : ""
    }${secure}`;
}

function systemPrefersDark(): boolean {
    return (
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
    );
}

let current: ColorMode =
    readCookie() ?? readStored() ?? (systemPrefersDark() ? "dark" : "light");
const listeners = new Set<() => void>();

function apply(): void {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", current === "dark");
    syncThemeColor();
}

// Match the browser chrome (theme-color) to the resolved desk color by reading
// the computed --polli-color-app-bg token — never a hardcoded value. Runs on
// mount / mode change, after styles load, so the token resolves per mode.
function syncThemeColor(): void {
    if (typeof document === "undefined") return;
    const appBg = getComputedStyle(document.documentElement)
        .getPropertyValue("--polli-color-app-bg")
        .trim();
    if (!appBg) return;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        document.head.appendChild(meta);
    }
    meta.setAttribute("content", appBg);
}

function emit(): void {
    for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent): void {
    if (event.key !== STORAGE_KEY) return;
    const next: ColorMode = event.newValue === "dark" ? "dark" : "light";
    if (next === current) return;
    current = next;
    apply();
    emit();
}

function subscribe(listener: () => void): () => void {
    if (listeners.size === 0 && typeof window !== "undefined") {
        // Migrate existing users: seed the cross-subdomain cookie from a
        // same-origin localStorage preference so embeds share it without a
        // re-toggle. No-op when the cookie already exists or only a system
        // fallback is active (readStored() returns null).
        if (!readCookie() && readStored()) {
            writeCookie(current);
        }
        apply(); // safety-net sync once a consumer mounts
        window.addEventListener("storage", handleStorage);
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") {
            window.removeEventListener("storage", handleStorage);
        }
    };
}

function getSnapshot(): ColorMode {
    return current;
}

function getServerSnapshot(): ColorMode {
    return "light";
}

/**
 * Set the color mode programmatically. Updates the shared store (so every
 * `useColorMode()` consumer re-renders), flips the `.dark` class, and persists
 * to the cross-subdomain cookie + the localStorage mirror. Exported so embedded
 * apps can apply a theme pushed by their host (see /play postMessage contract).
 */
export function setColorMode(mode: ColorMode): void {
    if (mode === current) return;
    current = mode;
    apply();
    writeCookie(mode);
    try {
        localStorage.setItem(STORAGE_KEY, mode);
    } catch {
        // ignore write failures (private mode / storage disabled)
    }
    emit();
}

export function useColorMode(): {
    mode: ColorMode;
    isDark: boolean;
    toggle: () => void;
} {
    const mode = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot,
    );
    return {
        mode,
        isDark: mode === "dark",
        toggle: () => setColorMode(mode === "dark" ? "light" : "dark"),
    };
}

/**
 * Sliding sun/moon switch. Light/dark is a two-state choice, not an on/off
 * affordance, so this uses `Switch`'s shape but its own palette. The thumb
 * carries the active mode's icon tinted with the accent (`text-soft`); the
 * mode you'd switch to sits ghosted (faint neutral) on the
 * empty side. Self-contained — wires itself to `useColorMode`.
 */
export const ColorModeToggle: FC = () => {
    const { isDark, toggle } = useColorMode();
    return (
        <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label="Toggle dark mode"
            onClick={toggle}
            className="polli-control polli:relative polli:inline-block polli:h-7 polli:w-[52px] polli:shrink-0 polli:cursor-pointer polli:rounded-full polli:border polli:border-theme-text-strong/10 polli:bg-surface-opaque polli:transition-colors"
        >
            {isDark ? (
                <SunIcon className="polli:absolute polli:top-1/2 polli:left-[7px] polli:h-3.5 polli:w-3.5 polli:-translate-y-1/2 polli:text-theme-text-strong/40" />
            ) : (
                <MoonIcon className="polli:absolute polli:top-1/2 polli:right-[7px] polli:h-3.5 polli:w-3.5 polli:-translate-y-1/2 polli:text-theme-text-strong/40" />
            )}
            <span
                className={cn(
                    "polli:absolute polli:top-1/2 polli:left-0.5 polli:flex polli:h-5 polli:w-5 polli:-translate-y-1/2 polli:items-center polli:justify-center polli:rounded-full polli:bg-app-bg polli:text-theme-text-soft polli:shadow-sm polli:transition-transform",
                    isDark ? "polli:translate-x-[26px]" : "polli:translate-x-0",
                )}
            >
                {isDark ? (
                    <MoonIcon className="polli:h-3.5 polli:w-3.5" />
                ) : (
                    <SunIcon className="polli:h-3.5 polli:w-3.5" />
                )}
            </span>
        </button>
    );
};
