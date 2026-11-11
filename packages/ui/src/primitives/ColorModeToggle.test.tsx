import { act, create } from "react-test-renderer";
import { expect, test, vi } from "vitest";

test("follows system color-mode changes unless an override is saved", async () => {
    const media = Object.assign(new EventTarget(), { matches: false });
    const storage = new Map<string, string>();
    const classes = new Set<string>();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal(
        "window",
        Object.assign(new EventTarget(), { matchMedia: () => media }),
    );
    vi.stubGlobal("document", {
        documentElement: {
            classList: {
                toggle: (name: string, enabled: boolean) =>
                    enabled ? classes.add(name) : classes.delete(name),
            },
        },
    });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    vi.resetModules();
    let renderer: ReturnType<typeof create> | undefined;
    try {
        const { useColorMode, setColorMode } = await import(
            "./ColorModeToggle.tsx"
        );
        function DisplayMode() {
            return <span>{useColorMode().mode}</span>;
        }
        await act(async () => {
            renderer = create(<DisplayMode />);
        });
        expect(renderer?.toJSON()).toMatchObject({ children: ["light"] });

        // The store's documented priority is saved choice → system preference.
        await act(async () => {
            media.matches = true;
            media.dispatchEvent(new Event("change"));
        });
        expect(renderer?.toJSON()).toMatchObject({ children: ["dark"] });
        expect(classes.has("dark")).toBe(true);
        expect(storage.has("polli-color-mode")).toBe(false);

        await act(async () => setColorMode("light"));
        expect(storage.get("polli-color-mode")).toBe("light");
        await act(async () => {
            media.matches = false;
            media.dispatchEvent(new Event("change"));
            media.matches = true;
            media.dispatchEvent(new Event("change"));
        });
        expect(renderer?.toJSON()).toMatchObject({ children: ["light"] });
        expect(classes.has("dark")).toBe(false);
        expect(storage.get("polli-color-mode")).toBe("light");
    } finally {
        await act(async () => renderer?.unmount());
        vi.unstubAllGlobals();
        vi.resetModules();
    }
});
