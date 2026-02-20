#!/usr/bin/env node
/**
 * Generate PWA assets for all apps in apps.json
 * Uses a single global theme color (#a3e635 - lime green)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "../..");

// Default colors (can be overridden by _defaults in apps.json)
let THEME_COLOR = "#a3e635";
let BACKGROUND_COLOR = "#110518";

// OG image dimensions
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Source logo
const LOGO_SVG = join(REPO_ROOT, "assets/logo.svg");

// Icon sizes
const ICON_SIZES = {
    favicons: [16, 32],
    pwa: [192, 512],
    apple: [180, 152, 167],
};

/**
 * Generate PNG icon from SVG
 */
async function generateIcon(svgBuffer, size, outputPath, tintColor) {
    // Tint the white logo with the theme color
    const svgString = svgBuffer
        .toString()
        .replace(/fill:#fff/g, `fill:${tintColor}`)
        .replace(/fill="#fff"/g, `fill="${tintColor}"`);
    const tintedBuffer = Buffer.from(svgString);

    await sharp(tintedBuffer)
        .resize(size, size, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(outputPath);
}

/**
 * Convert hex color to RGB object
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
          }
        : { r: 163, g: 230, b: 53 };
}

/**
 * Generate OG image (1200x630) with logo and title
 */
async function generateOgImage(svgBuffer, config, outputDir) {
    const title = config.title || "Pollinations App";
    const bgColor = hexToRgb(THEME_COLOR);

    // Create background
    const background = await sharp({
        create: {
            width: OG_WIDTH,
            height: OG_HEIGHT,
            channels: 4,
            background: { ...bgColor, alpha: 1 },
        },
    })
        .png()
        .toBuffer();

    // Tint and resize logo for OG image (200px)
    const svgString = svgBuffer
        .toString()
        .replace(/fill:#fff/g, `fill:${BACKGROUND_COLOR}`)
        .replace(/fill="#fff"/g, `fill="${BACKGROUND_COLOR}"`);
    const logoBuffer = await sharp(Buffer.from(svgString))
        .resize(200, 200, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

    // Create title SVG
    const escapedTitle = title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const textSvg = `
        <svg width="${OG_WIDTH}" height="100">
            <style>
                .title { fill: ${BACKGROUND_COLOR}; font-size: 64px; font-family: Arial, sans-serif; font-weight: bold; }
            </style>
            <text x="50%" y="70" text-anchor="middle" class="title">${escapedTitle}</text>
        </svg>
    `;
    const textBuffer = await sharp(Buffer.from(textSvg)).png().toBuffer();

    // Composite: background + logo (centered top) + title (centered bottom)
    await sharp(background)
        .composite([
            {
                input: logoBuffer,
                top: 150,
                left: Math.floor((OG_WIDTH - 200) / 2),
            },
            { input: textBuffer, top: 400, left: 0 },
        ])
        .png()
        .toFile(join(outputDir, "og-image.png"));
}

/**
 * Generate manifest.json for an app
 */
function generateManifest(appName, config, outputDir) {
    const title = config.title || `${appName}.pollinations.ai`;
    const description =
        config.description || `${appName} - powered by pollinations.ai`;

    const manifest = {
        name: title,
        short_name: appName,
        description: description,
        start_url: "/",
        display: "standalone",
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
            {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
    };

    writeFileSync(
        join(outputDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
    );
}

/**
 * Generate all assets for a single app
 */
async function generateAssetsForApp(appName, config) {
    const outputDir = join(REPO_ROOT, "apps", appName, "public");

    // Check if app directory exists
    if (!existsSync(join(REPO_ROOT, "apps", appName))) {
        console.log(`  ⏭️  Skipping ${appName} - directory doesn't exist`);
        return;
    }

    console.log(`\n📦 ${appName}`);

    // Ensure public directory exists
    mkdirSync(outputDir, { recursive: true });

    const svgBuffer = readFileSync(LOGO_SVG);

    // Generate favicons
    for (const size of ICON_SIZES.favicons) {
        const filename = `favicon-${size}x${size}.png`;
        await generateIcon(
            svgBuffer,
            size,
            join(outputDir, filename),
            THEME_COLOR,
        );
        console.log(`   ✓ ${filename}`);
    }

    // Generate favicon.ico (32x32 PNG renamed)
    await generateIcon(
        svgBuffer,
        32,
        join(outputDir, "favicon.ico"),
        THEME_COLOR,
    );
    console.log(`   ✓ favicon.ico`);

    // Generate PWA icons
    for (const size of ICON_SIZES.pwa) {
        const filename = `icon-${size}.png`;
        await generateIcon(
            svgBuffer,
            size,
            join(outputDir, filename),
            THEME_COLOR,
        );
        console.log(`   ✓ ${filename}`);
    }

    // Generate Apple touch icons
    for (const size of ICON_SIZES.apple) {
        const filename =
            size === 180
                ? "apple-touch-icon.png"
                : `apple-touch-icon-${size}x${size}.png`;
        await generateIcon(
            svgBuffer,
            size,
            join(outputDir, filename),
            THEME_COLOR,
        );
        console.log(`   ✓ ${filename}`);
    }

    // Generate manifest.json
    generateManifest(appName, config, outputDir);
    console.log(`   ✓ manifest.json`);

    // Generate OG image (1200x630)
    await generateOgImage(svgBuffer, config, outputDir);
    console.log(`   ✓ og-image.png`);
}

/**
 * Main
 */
async function main() {
    console.log("🚀 PWA Asset Generator for Apps");
    console.log("================================");

    // Load apps.json
    const appsJsonPath = join(REPO_ROOT, "apps/apps.json");
    const appsData = JSON.parse(readFileSync(appsJsonPath, "utf8"));

    // Extract defaults and apps
    const defaults = appsData._defaults || {};
    if (defaults.themeColor) THEME_COLOR = defaults.themeColor;
    if (defaults.backgroundColor) BACKGROUND_COLOR = defaults.backgroundColor;

    // Filter out _defaults from apps
    const apps = Object.fromEntries(
        Object.entries(appsData).filter(([key]) => !key.startsWith("_")),
    );

    // Parse CLI args
    const targetApp = process.argv[2];

    if (targetApp) {
        // Single app mode
        if (!apps[targetApp]) {
            console.error(`❌ App "${targetApp}" not found in apps.json`);
            process.exit(1);
        }
        await generateAssetsForApp(targetApp, apps[targetApp]);
    } else {
        // All apps mode
        for (const [appName, config] of Object.entries(apps)) {
            await generateAssetsForApp(appName, config);
        }
    }

    console.log("\n✅ Done!");
}

main().catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
});
