import { useEffect } from "react";
import WebFont from "webfontloader";

export function FontLoader() {
    useEffect(() => {
        WebFont.load({
            google: {
                families: ["Press Start 2P:400", "IBM Plex Mono:400,500,700"],
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
