import { useEffect } from "react";
import type {
    FontState,
    OpacityState,
    RadiusState,
    ThemeState,
} from "../types";
import { hexToRgb, tokenToCssVar } from "../utils/color-utils";

export function useColorSync(theme: ThemeState) {
    useEffect(() => {
        Object.values(theme).forEach((bucket) => {
            // Convert hex to RGB format for CSS variables
            const rgbValue = hexToRgb(bucket.color);

            bucket.tokens.forEach((tokenId) => {
                const cssVar = tokenToCssVar(tokenId);
                document.documentElement.style.setProperty(cssVar, rgbValue);
            });
        });
    }, [theme]);
}

export function useRadiusSync(radius: RadiusState) {
    useEffect(() => {
        Object.values(radius).forEach((bucket) => {
            bucket.tokens.forEach((tokenId) => {
                const cssVar = tokenToCssVar(tokenId);
                document.documentElement.style.setProperty(
                    cssVar,
                    bucket.value,
                );
            });
        });
    }, [radius]);
}

export function useFontSync(fonts: FontState) {
    useEffect(() => {
        const root = document.documentElement;
        const familiesToLoad: string[] = [];

        Object.values(fonts).forEach((data) => {
            // Sync CSS variable
            data.tokens.forEach((token) => {
                const cssVar = tokenToCssVar(token);
                root.style.setProperty(cssVar, `'${data.value}'`);
            });

            // Collect for loading
            if (data.value && data.value.trim() !== "") {
                familiesToLoad.push(data.value);
            }
        });

        // Load fonts via WebFontLoader
        if (familiesToLoad.length > 0) {
            import("webfontloader").then((WebFont) => {
                WebFont.load({
                    google: {
                        families: familiesToLoad.map(
                            (f) => `${f}:300,400,500,700`,
                        ),
                    },
                });
            });
        }
    }, [fonts]);
}

export function useOpacitySync(opacity: OpacityState) {
    useEffect(() => {
        Object.values(opacity).forEach((bucket) => {
            bucket.tokens.forEach((tokenId) => {
                const cssVar = tokenToCssVar(tokenId);
                document.documentElement.style.setProperty(
                    cssVar,
                    bucket.value,
                );
            });
        });
    }, [opacity]);
}
