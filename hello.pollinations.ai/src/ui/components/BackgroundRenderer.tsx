import { useTheme } from "../contexts/ThemeContext";
import { useMemo } from "react";

export function BackgroundRenderer() {
    const { backgroundHtml, themeDefinition } = useTheme();

    // Inject theme colors into HTML template
    const injectedHtml = useMemo(() => {
        if (!backgroundHtml) return null;

        // Extract colors for background tokens with intelligent fallbacks
        const getColorForToken = (tokenId: string, fallbackTokenId?: string): string => {
            const colorEntry = Object.values(themeDefinition.colors).find((c) =>
                c.ids.includes(tokenId as any)
            );
            
            // If not found and fallback provided, try fallback
            if (!colorEntry && fallbackTokenId) {
                const fallbackEntry = Object.values(themeDefinition.colors).find((c) =>
                    c.ids.includes(fallbackTokenId as any)
                );
                return fallbackEntry?.hex || "#000000";
            }
            
            return colorEntry?.hex || "#000000";
        };

        // Get background colors with fallbacks
        const backgroundBase = getColorForToken("background.base", "surface.base");
        const backgroundElement1 = getColorForToken("background.element1", "text.brand");
        const backgroundElement2 = getColorForToken("background.element2", "text.primary");
        const backgroundParticle = getColorForToken("background.particle", "text.highlight");

        // Replace all placeholder tokens with actual colors
        return backgroundHtml
            .replace(/\{\{BACKGROUND_BASE\}\}/g, backgroundBase)
            .replace(/\{\{BACKGROUND_ELEMENT1\}\}/g, backgroundElement1)
            .replace(/\{\{BACKGROUND_ELEMENT2\}\}/g, backgroundElement2)
            .replace(/\{\{BACKGROUND_PARTICLE\}\}/g, backgroundParticle);
    }, [backgroundHtml, themeDefinition]);

    if (!injectedHtml) return null;

    return (
        <div
            className="fixed inset-0 z-[-1] pointer-events-none"
            style={{
                backgroundColor: "var(--surface-base)", // Fallback
            }}
        >
            <iframe
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
