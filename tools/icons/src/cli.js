#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    renderFavicon,
    renderOg,
    renderPaddedIcon,
    renderSolidIcon,
} from "./render.js";

const require = createRequire(import.meta.url);

// tools/icons/src -> repo root is three levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// Single brand source: the logos shipped in the UI package (use currentColor).
const UI_ROOT = dirname(require.resolve("@pollinations/ui/package.json"));
const uiAsset = (file) => readFile(join(UI_ROOT, "src/assets", file), "utf8");
const loadLogo = () => uiAsset("logo.svg"); // lotus mark — icons + OG
const loadText = () => uiAsset("logo-text.svg"); // logotype — OG card

// One lotus mark, two tones from the UI palette:
//   - FIELD (`bgPale.accent`, washed cream): the field a DARK lotus/logotype
//     sits on — large/lockup use. The dark mark does the contrast work, so the
//     field stays pale and calm (OG, apple-touch, maskable, manifest theme_color).
//   - MARK (`bgActive.accent`, the brighter accent step): the lotus painted IN
//     this color on transparent, standing alone and small — only the line color
//     carries it, so it needs the chroma (favicon, padded app icons).
//   - `brandDark`: the dark lotus/contrast color. No color is ever per-app.
const palette = JSON.parse(
    await readFile(join(UI_ROOT, "src/theme-palette.json"), "utf8"),
);
const FIELD_COLOR = palette.bgPale?.accent;
const MARK_COLOR = palette.bgActive?.accent;
const CONTRAST_COLOR = palette.brandDark;
if (!FIELD_COLOR || !MARK_COLOR) {
    throw new Error(
        'theme-palette.json needs "bgPale.accent" and "bgActive.accent"',
    );
}

const APPS = {
    react: {
        outDir: "apps/react/public",
        og: true,
        manifest: {
            name: "React UI | pollinations.ai",
            short_name: "React UI",
            description:
                "React UI showcase for the Pollinations SDK and UI component library — auth, wallet, and design primitives.",
        },
    },
    playground: {
        outDir: "apps/playground/public",
        og: true,
        manifest: {
            name: "Playground | pollinations.ai",
            short_name: "Playground",
            description:
                "Generate images, text, and audio with the Pollinations API in one focused playground.",
        },
    },
    catgpt: {
        outDir: "apps/catgpt/public",
        og: true,
        manifest: {
            name: "CatGPT | pollinations.ai",
            short_name: "CatGPT",
            description:
                "Ask CatGPT a question and generate a dismissive cat comic meme.",
        },
    },
    enter: {
        outDir: "enter.pollinations.ai/frontend/public",
        og: true,
        manifest: {
            name: "Dashboard | pollinations.ai",
            short_name: "Dashboard",
            description:
                "Pollinations dashboard for AI generation APIs. Create API keys, track usage, monitor Pollen, and connect apps across image, text, video, and audio.",
        },
    },
    gen: {
        outDir: "gen.pollinations.ai/public",
        og: true,
        maskable: true,
    },
    "model-monitor": {
        outDir: "apps/model-monitor/public",
        og: true,
        manifest: {
            name: "Model Monitor | pollinations.ai",
            short_name: "Model Monitor",
            description:
                "Real-time health monitoring for Pollinations AI models.",
        },
    },
    websim: {
        outDir: "apps/websim/public",
        og: true,
        manifest: {
            name: "Websim | pollinations.ai",
            short_name: "Websim",
            description:
                "Generate shareable single-file HTML pages with Pollinations Websim.",
        },
    },
};

const FAVICON_SIZES = [16, 32];
const PWA_SIZES = [192, 512];
const APPLE = [
    [180, "apple-touch-icon.png"],
    [152, "apple-touch-icon-152x152.png"],
    [167, "apple-touch-icon-167x167.png"],
];

function parseApp(argv) {
    const eq = argv.find((a) => a.startsWith("--app="));
    if (eq) return eq.slice("--app=".length);
    const i = argv.indexOf("--app");
    return i >= 0 ? argv[i + 1] : undefined;
}

function manifestJson(cfg, brandColor, contrastColor) {
    return {
        name: cfg.manifest.name,
        short_name: cfg.manifest.short_name,
        description: cfg.manifest.description,
        icons: [
            {
                src: "/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icon-maskable-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
        theme_color: brandColor,
        background_color: contrastColor,
        display: "standalone",
        start_url: cfg.manifest.start_url ?? "/",
    };
}

async function generate(name) {
    const cfg = APPS[name];
    if (!cfg) {
        throw new Error(
            `Unknown app "${name}". Known: ${Object.keys(APPS).join(", ")}`,
        );
    }
    const svg = await loadLogo();
    const outDir = join(REPO_ROOT, cfg.outDir);
    await mkdir(outDir, { recursive: true });
    const write = (file, buf) => writeFile(join(outDir, file), buf);

    // Favicons: the lotus stands alone on transparent and tiny — bright mark.
    for (const size of FAVICON_SIZES) {
        await write(
            `favicon-${size}x${size}.png`,
            await renderFavicon(svg, size, MARK_COLOR),
        );
    }
    await write("favicon.ico", await renderFavicon(svg, 32, MARK_COLOR));

    // "any" PWA icons: transparent standalone lotus (app icon) — bright mark.
    for (const size of PWA_SIZES) {
        await write(
            `icon-${size}.png`,
            await renderPaddedIcon(svg, size, MARK_COLOR),
        );
    }

    // Apple touch icons: washed field behind a dark lotus, so iOS never renders
    // the logo on a black square.
    const solid = {
        bg: FIELD_COLOR,
        logoColor: CONTRAST_COLOR,
        fraction: 0.65,
    };
    for (const [size, file] of APPLE) {
        await write(file, await renderSolidIcon(svg, size, solid));
    }

    // Maskable PWA icon: washed field + extra safe-zone margin.
    if (cfg.manifest || cfg.maskable) {
        await write(
            "icon-maskable-512.png",
            await renderSolidIcon(svg, 512, { ...solid, fraction: 0.6 }),
        );
    }

    // OG card: lotus stacked above the logotype on a washed field — the dark mark
    // does the contrast work, and stacking stays inside the central square so small
    // link-preview thumbnails crop to 1:1 without losing the name. Both pieces are
    // modular brand atoms, composed here — nothing extracted at render time.
    if (cfg.og) {
        const text = await loadText();
        await write(
            "og-image.png",
            await renderOg(svg, text, {
                bg: FIELD_COLOR,
                logoColor: CONTRAST_COLOR,
            }),
        );
    }
    if (cfg.manifest) {
        await write(
            "manifest.webmanifest",
            `${JSON.stringify(manifestJson(cfg, FIELD_COLOR, CONTRAST_COLOR), null, 4)}\n`,
        );
    }

    console.log(`icons: generated "${name}" -> ${cfg.outDir}`);
}

const app = parseApp(process.argv.slice(2));
if (!app) {
    console.error("Usage: npm run generate -- --app <name>");
    process.exit(1);
}
try {
    await generate(app);
} catch (err) {
    console.error(`icons: ${err.message}`);
    process.exit(1);
}
