// Canvas presets for the brand asset generator — pure data, one line per size.
//
//   content : which composition to place
//             mark | wordmark | lockup-horizontal | lockup-stacked
//             bee  | bee-horizontal | bee-stacked   (Polli, raster full-colour)
//   pad     : safe-area inset as a fraction of the shorter side
//             (0 = full-bleed favicon; ~0.18 = clears a circular avatar mask)
//   bg      : "transparent" | "pale" | any hex   (per-preset default; --bg overrides)
//
// Add a platform by adding a line. No code change.

export const PRESETS = {
    // --- app icons ---
    "favicon-16": { w: 16, h: 16, content: "mark", pad: 0, bg: "transparent" },
    "favicon-32": { w: 32, h: 32, content: "mark", pad: 0, bg: "transparent" },
    "apple-touch": { w: 180, h: 180, content: "mark", pad: 0.14, bg: "pale" },
    "pwa-192": { w: 192, h: 192, content: "mark", pad: 0.12, bg: "pale" },
    "pwa-512": { w: 512, h: 512, content: "mark", pad: 0.12, bg: "pale" },
    "maskable-512": { w: 512, h: 512, content: "mark", pad: 0.2, bg: "pale" },
    og: {
        w: 1200,
        h: 630,
        content: "lockup-horizontal",
        pad: 0.22,
        bg: "pale",
    },

    // --- social ---
    profile: { w: 512, h: 512, content: "mark", pad: 0.18, bg: "pale" },
    "x-avatar": { w: 400, h: 400, content: "mark", pad: 0.18, bg: "pale" },
    "x-header": {
        w: 1500,
        h: 500,
        content: "lockup-horizontal",
        pad: 0.28,
        bg: "pale",
    },
    "ig-post": {
        w: 1080,
        h: 1080,
        content: "lockup-stacked",
        pad: 0.22,
        bg: "pale",
    },
    "ig-story": {
        w: 1080,
        h: 1920,
        content: "lockup-stacked",
        pad: 0.3,
        bg: "pale",
    },
    "fb-cover": {
        w: 1200,
        h: 630,
        content: "lockup-horizontal",
        pad: 0.26,
        bg: "pale",
    },
};

export const KITS = {
    app: [
        "favicon-16",
        "favicon-32",
        "apple-touch",
        "pwa-192",
        "pwa-512",
        "maskable-512",
        "og",
    ],
    social: [
        "profile",
        "x-avatar",
        "x-header",
        "ig-post",
        "ig-story",
        "fb-cover",
    ],
};
