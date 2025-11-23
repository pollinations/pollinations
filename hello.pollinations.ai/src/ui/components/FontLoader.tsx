import { useEffect } from "react";
import WebFont from "webfontloader";
import { getGoogleFontFamilies } from "../../content/theme/fonts";

export function FontLoader() {
    useEffect(() => {
        WebFont.load({
            google: {
                families: getGoogleFontFamilies(),
            },
            active: () => {
                console.log("Fonts loaded successfully");
            },
            inactive: () => {
                console.warn("Failed to load fonts");
            },
        });
    }, []);

    return null;
}
