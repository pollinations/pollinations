/**
 * Real product screenshots come from the public app directory. Every missing
 * screenshot gets the same recognizable Polli fallback so the catalogue stays
 * honest: generated art never pretends to be the app itself.
 */

const PLAYGROUND_SCREENSHOT =
    "https://media.pollinations.ai/7158f20b-4d9c-4026-a6f9-9fe452064a7a";
export const MISSING_SCREENSHOT = "/app-art/missing-screenshot.webp";

export function appCover(name: string, screenshotUrl = ""): string {
    if (screenshotUrl) return screenshotUrl;
    if (name === "Pollinations Playground") return PLAYGROUND_SCREENSHOT;
    return MISSING_SCREENSHOT;
}

export function isAppScreenshot(src: string): boolean {
    return src.startsWith("https://media.pollinations.ai/");
}
