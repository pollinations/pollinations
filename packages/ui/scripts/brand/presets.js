// Canvas presets for the brand asset generator — pure data, one line per size.
//
//   content : mark | wordmark | lockup-horizontal | lockup-stacked
//             bee | bee-horizontal | bee-stacked   (Polli, raster full-colour)
//   pad     : safe-area inset as a fraction of the shorter side
//             (0 = full-bleed favicon; ~0.18 = clears a circular avatar mask)
//   theme   : default front + background pair, matching enter.pollinations.ai:
//               mark  → gold lotus on transparent  (favicons, app icons)
//               field → dark lotus on cream field   (OG, apple-touch, social)
//             Colours live in theme-palette.json; override a run with --fg / --bg.
//
// Add a platform by adding a line. No code change.

export const PRESETS = {
    // --- app icons ---
    "favicon-16": { w: 16, h: 16, content: "mark", pad: 0, theme: "mark" },
    "favicon-32": { w: 32, h: 32, content: "mark", pad: 0, theme: "mark" },
    "pwa-192": { w: 192, h: 192, content: "mark", pad: 0.175, theme: "mark" },
    "pwa-512": { w: 512, h: 512, content: "mark", pad: 0.175, theme: "mark" },
    "apple-touch": {
        w: 180,
        h: 180,
        content: "mark",
        pad: 0.175,
        theme: "field",
    },
    "maskable-512": {
        w: 512,
        h: 512,
        content: "mark",
        pad: 0.2,
        theme: "field",
    },
    og: {
        w: 1200,
        h: 630,
        content: "lockup-stacked",
        pad: 0.2,
        theme: "field",
    },

    // --- social (dark lotus on cream — legible filled cards + avatars) ---
    profile: { w: 512, h: 512, content: "mark", pad: 0.18, theme: "field" },
    "x-avatar": { w: 400, h: 400, content: "mark", pad: 0.18, theme: "field" },
    "x-header": {
        w: 1500,
        h: 500,
        content: "lockup-horizontal",
        pad: 0.28,
        theme: "field",
    },
    "ig-post": {
        w: 1080,
        h: 1080,
        content: "lockup-stacked",
        pad: 0.22,
        theme: "field",
    },
    "ig-story": {
        w: 1080,
        h: 1920,
        content: "lockup-stacked",
        pad: 0.3,
        theme: "field",
    },
    "fb-cover": {
        w: 1200,
        h: 630,
        content: "lockup-stacked",
        pad: 0.2,
        theme: "field",
    },
};

export const KITS = {
    app: [
        "favicon-16",
        "favicon-32",
        "pwa-192",
        "pwa-512",
        "apple-touch",
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
