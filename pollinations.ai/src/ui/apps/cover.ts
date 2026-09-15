/**
 * Real product screenshots come from the public app directory. Every missing
 * screenshot gets the same recognizable Polli fallback so the directory stays
 * honest: generated art never pretends to be the app itself.
 */

export const MISSING_SCREENSHOT = "/app-art/missing-screenshot.webp";

export function appCover(screenshotUrl = ""): string {
    return screenshotUrl || MISSING_SCREENSHOT;
}

export function isAppScreenshot(src: string): boolean {
    return src.startsWith("https://media.pollinations.ai/");
}
