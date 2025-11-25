import { useTheme } from "../contexts/ThemeContext";
import { useMemo, useEffect, useState } from "react";

export function BackgroundRenderer() {
    const { backgroundHtml, themeDefinition } = useTheme();
    
    // Store current colors in state to trigger re-renders when they change via MutationObserver
    const [currentColors, setCurrentColors] = useState<{
        base: string;
        element1: string;
        element2: string;
        particle: string;
    } | null>(null);

    // Initialize colors from theme definition on mount or when theme changes
    useEffect(() => {
        if (!themeDefinition) return;

        const getColor = (ids: string[]) => {
            const colorEntry = Object.values(themeDefinition.colors).find((c) => 
                c.ids.some(id => ids.includes(id))
            );
            return colorEntry?.hex || "#000000";
        };

        setCurrentColors({
            base: getColor(["background.base", "surface.base"]),
            element1: getColor(["background.element1", "text.brand"]),
            element2: getColor(["background.element2", "text.primary"]),
            particle: getColor(["background.particle", "text.highlight"]),
        });
    }, [themeDefinition]);

    // Watch for CSS variable changes (triggered by ThemeEditor)
    useEffect(() => {
        let timeoutId: NodeJS.Timeout;

        const updateColorsFromCSS = () => {
            const getCssColor = (varName: string, fallbackHex: string) => {
                const style = document.documentElement.style.getPropertyValue(varName).trim();
                if (!style) return fallbackHex;

                // Parse "255 255 255" format
                const parts = style.split(" ");
                if (parts.length >= 3) {
                    const r = parseInt(parts[0]);
                    const g = parseInt(parts[1]);
                    const b = parseInt(parts[2]);
                    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
                        return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
                    }
                }
                return fallbackHex;
            };

            setCurrentColors(prev => {
                if (!prev) return null;
                
                const newColors = {
                    base: getCssColor("--background-base", prev.base),
                    element1: getCssColor("--background-element1", prev.element1),
                    element2: getCssColor("--background-element2", prev.element2),
                    particle: getCssColor("--background-particle", prev.particle),
                };

                // Only update if changed
                if (
                    newColors.base !== prev.base ||
                    newColors.element1 !== prev.element1 ||
                    newColors.element2 !== prev.element2 ||
                    newColors.particle !== prev.particle
                ) {
                    return newColors;
                }
                return prev;
            });
        };

        const observer = new MutationObserver((mutations) => {
            const hasStyleChange = mutations.some(
                (m) => m.type === "attributes" && m.attributeName === "style"
            );

            if (hasStyleChange) {
                // Debounce updates to prevent flickering/performance issues during drag
                clearTimeout(timeoutId);
                timeoutId = setTimeout(updateColorsFromCSS, 150);
            }
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style"],
        });

        return () => {
            observer.disconnect();
            clearTimeout(timeoutId);
        };
    }, []);

    // Inject theme colors into HTML template
    const injectedHtml = useMemo(() => {
        if (!backgroundHtml || !currentColors) return null;

        // Replace all placeholder tokens with actual colors
        return backgroundHtml
            .replace(/\{\{BACKGROUND_BASE\}\}/g, currentColors.base)
            .replace(/\{\{BACKGROUND_ELEMENT1\}\}/g, currentColors.element1)
            .replace(/\{\{BACKGROUND_ELEMENT2\}\}/g, currentColors.element2)
            .replace(/\{\{BACKGROUND_PARTICLE\}\}/g, currentColors.particle);
    }, [backgroundHtml, currentColors]);

    if (!injectedHtml) return null;

    return (
        <div
            className="fixed inset-0 z-[-1] pointer-events-none"
            style={{
                backgroundColor: currentColors?.base || "#000000",
            }}
        >
            <iframe
                key={JSON.stringify(currentColors)} // Force reload when colors change
                srcDoc={injectedHtml}
                title="Background"
                className="w-full h-full border-0"
                style={{
                    pointerEvents: "auto", // Allow mouse interaction if needed (e.g. parallax)
                }}
            />
        </div>
    );
}
