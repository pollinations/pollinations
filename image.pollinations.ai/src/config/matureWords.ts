/**
 * Explicit blocklist for instant rejection (Tier 0).
 *
 * These terms are unambiguously NSFW with NO legitimate non-explicit meaning.
 * Used for fast pre-filtering before AI-based content classification.
 *
 * IMPORTANT: Keep this list minimal and precise.
 * - Only include terms that are ALWAYS explicit
 * - Do NOT add words with dual meanings (e.g., "cock", "ass", "balls")
 * - Context-aware AI (gemini-fast) handles nuanced/edge cases
 */
export const words = [
    // Pornography
    "porn",
    "porno",
    "pornography",
    "pornhub",
    "xvideos",
    "xhamster",
    "redtube",
    "youporn",
    "brazzers",

    // Explicit sexual acts
    "blowjob",
    "handjob",
    "footjob",
    "rimjob",
    "titjob",
    "boobjob",
    "bukkake",
    "creampie",
    "cumshot",
    "gangbang",
    "deepthroat",
    "fellatio",
    "cunnilingus",
    "anilingus",

    // Hentai/Anime explicit
    "hentai",
    "futanari",
    "ahegao",
    "rule34",

    // Illegal content
    "loli",
    "lolicon",
    "shota",
    "shotacon",
    "jailbait",

    // Explicit fetishes
    "zoophilia",
    "necrophilia",
    "coprophilia",
    "urophilia",
    "vorarephilia",
    "guro",
    "snuff",

    // Sexual fluids (explicit terms)
    "cumming",
    "jizz",
    "splooge",
    "creampied",

    // Explicit platforms
    "onlyfans",
    "chaturbate",
    "livejasmin",
    "camgirl",

    // Explicit modifiers (unambiguous)
    "nsfw",
    "xxxrated",
];
