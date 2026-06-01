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
const loadLogo = () => uiAsset("logo.svg"); // flower — icons
const loadWordmark = () => uiAsset("logo-wordmark.svg"); // wordmark — OG card

const DARK = "#110518"; // pollinations splash / OG contrast
const REACT_BLUE = "#DBEAFE"; // blue theme bg-pale token

const APPS = {
    react: {
        brandColor: REACT_BLUE,
        contrastColor: DARK,
        outDir: "apps/react/public",
        og: true,
        manifest: {
            name: "pollinations.ai - React UI",
            short_name: "Pollinations React",
            description:
                "React UI showcase for the Pollinations SDK and UI component library.",
        },
    },
    enter: {
        brandColor: "#D1FAE4", // unchanged; not one of the named themes
        contrastColor: DARK,
        outDir: "enter.pollinations.ai/frontend/public",
        og: true,
        manifest: null, // hand-maintained — leave it alone
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

function manifestJson(cfg) {
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
        theme_color: cfg.brandColor,
        background_color: cfg.contrastColor,
        display: "standalone",
        start_url: "/",
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

    for (const size of FAVICON_SIZES) {
        await write(
            `favicon-${size}x${size}.png`,
            await renderFavicon(svg, size, cfg.brandColor),
        );
    }
    await write("favicon.ico", await renderFavicon(svg, 32, cfg.brandColor));

    // "any" PWA icons: transparent, padded brand logo.
    for (const size of PWA_SIZES) {
        await write(
            `icon-${size}.png`,
            await renderPaddedIcon(svg, size, cfg.brandColor),
        );
    }

    // Apple touch icons: opaque so iOS never renders the logo on a black square.
    const solid = {
        bg: cfg.brandColor,
        logoColor: cfg.contrastColor,
        fraction: 0.65,
    };
    for (const [size, file] of APPLE) {
        await write(file, await renderSolidIcon(svg, size, solid));
    }

    // Maskable PWA icon: opaque background + extra safe-zone margin (manifest apps only).
    if (cfg.manifest) {
        await write(
            "icon-maskable-512.png",
            await renderSolidIcon(svg, 512, { ...solid, fraction: 0.6 }),
        );
    }

    if (cfg.og) {
        const wordmark = await loadWordmark();
        await write(
            "og-image.png",
            await renderOg(wordmark, {
                bg: cfg.brandColor,
                logoColor: cfg.contrastColor,
            }),
        );
    }
    if (cfg.manifest) {
        await write(
            "manifest.webmanifest",
            `${JSON.stringify(manifestJson(cfg), null, 4)}\n`,
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
