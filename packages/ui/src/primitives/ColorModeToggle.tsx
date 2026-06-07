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
 * Host apps should set the initial class pre-paint (a tiny inline script in the
 * document head, reading the same STORAGE_KEY) to avoid a flash of light before
 * React mounts; this store is the source of truth after hydration.
 *
 * Side-effect-free on import: the <html> sync and the cross-tab listener are
 * attached lazily on first subscribe, so importing this module (e.g. via the
 * package barrel) never mutates the DOM on its own.
 */
export type ColorMode = "light" | "dark";

const STORAGE_KEY = "polli-color-mode";

function readStored(): ColorMode | null {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        return value === "light" || value === "dark" ? value : null;
    } catch {
        return null;
    }
}

function systemPrefersDark(): boolean {
    return (
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
    );
}

let current: ColorMode =
    readStored() ?? (systemPrefersDark() ? "dark" : "light");
const listeners = new Set<() => void>();

function apply(): void {
    if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", current === "dark");
        // Keep the browser chrome (theme-color) matched to the desk color
        // (--polli-color-app-bg) so the mobile address bar flips with the mode.
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute(
                "content",
                current === "dark" ? "#232528" : "#ebe7df",
            );
        }
    }
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

export function setColorMode(mode: ColorMode): void {
    if (mode === current) return;
    current = mode;
    apply();
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
 * affordance, so this uses a neutral palette (no green) rather than `Switch`.
 * The thumb carries the active mode's icon; the mode you'd switch to sits
 * ghosted on the empty side. Self-contained — wires itself to `useColorMode`.
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
                    "polli:absolute polli:top-1/2 polli:left-0.5 polli:flex polli:h-5 polli:w-5 polli:-translate-y-1/2 polli:items-center polli:justify-center polli:rounded-full polli:bg-app-bg polli:text-theme-text-strong polli:shadow-sm polli:transition-transform",
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
