import { useColorMode } from "@pollinations/ui";

/**
 * The website's illustrations live in public/art/ as
 * <page>-<slot>-<day|night>.webp plus a -1024 copy. New ones are drawn by
 * art/generate.mjs and copied in by hand.
 */

export type ArtPage = "home" | "play" | "apps" | "community";
type ArtSlot = "hero" | "quests" | "votes" | "placeholder" | "closing";

/** One illustration in a fixed light, for panels that are always dark. */
export function artFor(page: ArtPage, slot: ArtSlot, light: "day" | "night") {
    const base = `/art/${page}-${slot}-${light}`;
    return {
        src: `${base}.webp`,
        srcSet: `${base}-1024.webp 1024w, ${base}.webp 2048w`,
    };
}

/** One illustration in the current light: day in light mode, night in dark mode. */
export function useArt(page: ArtPage, slot: ArtSlot) {
    return artFor(page, slot, useColorMode().isDark ? "night" : "day");
}
