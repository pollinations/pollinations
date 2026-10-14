import { type FC, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons/index.tsx";
import { Switch } from "./Switch.tsx";

/**
 * Light/dark colour mode. The chosen mode is reflected as `class="dark"` on
 * <html>, which flips the design-system tokens (see styles/tokens.css: `.dark`
 * + `.dark [data-theme]`). One shared module-level store backs every
 * `useColorMode()` consumer, so duplicate toggles never desync and changes
 * propagate across tabs.
 *
 * The chosen mode is persisted to localStorage (per-origin), which also powers
 * the cross-tab `storage` sync below. Read priority: localStorage → system
 * preference. Choosing the mode the system already uses clears the stored
 * choice, so later visits follow the system again.
 *
 * Host apps should set the initial class pre-paint (a tiny inline script in the
 * document head, reading the same key) to avoid a flash of light before React
 * mounts; this store is the source of truth after hydration.
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

function systemMode(): ColorMode {
    return typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
        ? "dark"
        : "light";
}

let current: ColorMode = readStored() ?? systemMode();
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
    const next = readStored() ?? systemMode();
    if (next === current) return;
    current = next;
    apply();
    emit();
}

function subscribe(listener: () => void): () => void {
    if (listeners.size === 0 && typeof window !== "undefined") {
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
 * to localStorage, or clears it when the mode matches the system.
 */
export function setColorMode(mode: ColorMode): void {
    if (mode === current) return;
    current = mode;
    apply();
    try {
        if (mode === systemMode()) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, mode);
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
 * Sliding sun/moon switch: `Switch` as a two-way choice, so the track stays
 * neutral and the thumb carries the active mode's icon. Self-contained —
 * wires itself to `useColorMode`.
 */
export const ColorModeToggle: FC = () => {
    const { isDark, toggle } = useColorMode();
    return (
        <Switch
            checked={isDark}
            onChange={toggle}
            ariaLabel="Toggle dark mode"
            size="sm"
            icons={{ off: <SunIcon />, on: <MoonIcon /> }}
        />
    );
};
