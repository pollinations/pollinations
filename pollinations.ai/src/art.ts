import { useColorMode } from "@pollinations/ui";

/**
 * The live illustration set: a folder in public/art/ holding set.json (every
 * prompt) and its images. scripts/art.mjs makes a new set; switching sets is
 * this one constant.
 */
export const ART_SET = "v2";

type ArtPage = "home" | "play" | "apps" | "community";
type ArtSlot = "hero" | "quests" | "sky" | "votes" | "placeholder" | "closing";

/** One illustration in the current light: day in light mode, night in dark mode. */
export function useArt(page: ArtPage, slot: ArtSlot) {
    const light = useColorMode().isDark ? "night" : "day";
    const base = `/art/${ART_SET}/${page}-${slot}-${light}`;
    return {
        src: `${base}.webp`,
        srcSet: `${base}-1024.webp 1024w, ${base}.webp 2048w`,
    };
}
