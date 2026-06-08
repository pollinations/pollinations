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

// Colors are owned by the apps, not this tool. Each app declares its theme in
// its own package.json (`pollinations.theme` → resolved from the UI palette).
// This tool only knows where each app lives and what its manifest says — never
// a color value.
const palette = JSON.parse(
    await readFile(join(UI_ROOT, "src/theme-palette.json"), "utf8"),
);

const APPS = {
    react: {
        dir: "apps/react",
        outDir: "apps/react/public",
        og: true,
        manifest: {
            name: "React UI | pollinations.ai",
            short_name: "React UI",
            description:
                "React UI showcase for the Pollinations SDK and UI component library.",
        },
    },
    playground: {
        dir: "apps/playground",
        outDir: "apps/playground/public",
        og: true,
        manifest: {
            name: "Pollinations Playground",
            short_name: "Playground",
            description:
                "Generate images, text, and audio with the Pollinations API in one focused playground.",
        },
    },
    enter: {
        dir: "enter.pollinations.ai",
        outDir: "enter.pollinations.ai/frontend/public",
        og: true,
        manifest: null, // hand-maintained — leave it alone
    },
    "model-monitor": {
        dir: "apps/model-monitor",
        outDir: "apps/model-monitor/public",
        og: true,
        manifest: {
            name: "Model Monitor | pollinations.ai",
            short_name: "Model Monitor",
            description:
                "Real-time health monitoring for Pollinations AI models.",
        },
    },
};

// Read the app's declared theme from its own package.json and resolve it to its
// bg-pale hex via the UI palette. No color ever lives in this tool.
async function resolveColors(cfg) {
    const pkg = JSON.parse(
        await readFile(join(REPO_ROOT, cfg.dir, "package.json"), "utf8"),
    );
    const decl = pkg.pollinations ?? {};
    if (!decl.theme) {
        throw new Error(`${cfg.dir}/package.json has no "pollinations.theme"`);
    }

    const brandColor = palette.bgPale[decl.theme];
    if (!brandColor) {
        throw new Error(
            `${cfg.dir}/package.json: unknown theme "${decl.theme}" (known: ${Object.keys(palette.bgPale).join(", ")})`,
        );
    }
    return { brandColor, contrastColor: palette.brandDark };
}

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
    const { brandColor, contrastColor } = await resolveColors(cfg);
    const svg = await loadLogo();
    const outDir = join(REPO_ROOT, cfg.outDir);
    await mkdir(outDir, { recursive: true });
    const write = (file, buf) => writeFile(join(outDir, file), buf);

    for (const size of FAVICON_SIZES) {
        await write(
            `favicon-${size}x${size}.png`,
            await renderFavicon(svg, size, brandColor),
        );
    }
    await write("favicon.ico", await renderFavicon(svg, 32, brandColor));

    // "any" PWA icons: transparent, padded brand logo.
    for (const size of PWA_SIZES) {
        await write(
            `icon-${size}.png`,
            await renderPaddedIcon(svg, size, brandColor),
        );
    }

    // Apple touch icons: opaque so iOS never renders the logo on a black square.
    const solid = {
        bg: brandColor,
        logoColor: contrastColor,
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
                bg: brandColor,
                logoColor: contrastColor,
            }),
        );
    }
    if (cfg.manifest) {
        await write(
            "manifest.webmanifest",
            `${JSON.stringify(manifestJson(cfg, brandColor, contrastColor), null, 4)}\n`,
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
