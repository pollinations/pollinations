#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { APP_CONFIGS } from "./app-configs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repository root
const REPO_ROOT = join(__dirname, "../..");

// Build full app configs with resolved paths
const APPS = {};
for (const [key, config] of Object.entries(APP_CONFIGS)) {
    APPS[key] = {
        ...config,
        sourceSvg: join(__dirname, config.sourceSvg),
        outputDir: join(REPO_ROOT, config.outputDir),
    };
}

// Icon sizes to generate
const ICON_SIZES = {
    favicons: [16, 32],
    pwa: [192, 512],
    apple: [180, 152, 167],
};

// Parse command line arguments
const args = process.argv.slice(2);
const appArg = args.find((arg) => arg.startsWith("--app="));
const targetApp = appArg ? appArg.split("=")[1] : "all";

/**
 * Tint SVG by replacing black/white fills with the given color
 */
function tintSvg(svgBuffer, color) {
    return Buffer.from(
        svgBuffer
            .toString()
            .replace(/fill="#fff"/gi, `fill="${color}"`)
            .replace(/fill:#fff/gi, `fill:${color}`)
            .replace(/fill="#ffffff"/gi, `fill="${color}"`)
            .replace(/fill:#ffffff/gi, `fill:${color}`)
            .replace(/fill="#000000"/gi, `fill="${color}"`)
            .replace(/fill:#000000/gi, `fill:${color}`)
            .replace(/fill="#000"/gi, `fill="${color}"`)
            .replace(/fill:#000/gi, `fill:${color}`),
    );
}

/**
 * Generate favicon (16x16 or 32x32) — logo fills 100% of canvas, transparent bg
 */
async function generateFaviconPng(svgBuffer, size, outputPath, color) {
    console.log(`  Generating ${size}x${size} → ${outputPath}`);
    const input = color ? tintSvg(svgBuffer, color) : svgBuffer;
    await sharp(input)
        .resize(size, size, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(outputPath);
}

/**
 * Generate favicon.ico (32x32 PNG saved as .ico)
 */
async function generateFaviconIco(svgBuffer, outputPath, color) {
    console.log(`  Generating favicon.ico → ${outputPath}`);
    const input = color ? tintSvg(svgBuffer, color) : svgBuffer;
    await sharp(input)
        .resize(32, 32, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(outputPath);
}

/**
 * Generate PWA/Apple icon — logo at 65% with padding, transparent bg
 */
async function generatePaddedIcon(svgBuffer, size, outputPath, color) {
    console.log(`  Generating ${size}x${size} (padded) → ${outputPath}`);
    const input = color ? tintSvg(svgBuffer, color) : svgBuffer;
    const logoSize = Math.round(size * 0.65);
    const padding = Math.floor((size - logoSize) / 2);

    // Render logo at 65% size
    const logo = await sharp(input)
        .resize(logoSize, logoSize, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

    // Place on transparent canvas with padding
    await sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite([{ input: logo, top: padding, left: padding }])
        .png()
        .toFile(outputPath);
}

/**
 * Generate all assets for an app
 */
async function generateAssetsForApp(appKey, appConfig) {
    console.log(`\n📦 Generating assets for ${appConfig.name}...`);

    try {
        const svgBuffer = readFileSync(appConfig.sourceSvg);
        const outputDir = appConfig.outputDir;
        const color = appConfig.iconColor || appConfig.themeColor;

        mkdirSync(outputDir, { recursive: true });

        // Favicons — 100% fill, transparent bg
        console.log("\n🎨 Favicons:");
        for (const size of ICON_SIZES.favicons) {
            await generateFaviconPng(
                svgBuffer,
                size,
                join(outputDir, `favicon-${size}x${size}.png`),
                color,
            );
        }
        await generateFaviconIco(
            svgBuffer,
            join(outputDir, "favicon.ico"),
            color,
        );

        // PWA icons — 65% with padding, transparent bg
        console.log("\n📱 PWA Icons:");
        for (const size of ICON_SIZES.pwa) {
            await generatePaddedIcon(
                svgBuffer,
                size,
                join(outputDir, `icon-${size}.png`),
                color,
            );
        }

        // Apple touch icons — 65% with padding, transparent bg
        console.log("\n🍎 Apple Icons:");
        for (const size of ICON_SIZES.apple) {
            const filename =
                size === 180
                    ? "apple-touch-icon.png"
                    : `apple-touch-icon-${size}x${size}.png`;
            await generatePaddedIcon(
                svgBuffer,
                size,
                join(outputDir, filename),
                color,
            );
        }

        // Copy source SVGs for direct use
        console.log("\n📋 Copying Source SVGs:");
        if (appKey === "enter") {
            const logoTextSource = join(__dirname, appConfig.ogSourceSvg);
            const logoTextDest = join(outputDir, "logo_text_black.svg");
            console.log(`  Copying logo-text → ${logoTextDest}`);
            writeFileSync(logoTextDest, readFileSync(logoTextSource));
        } else if (appKey === "pollinations") {
            const srcLogoDir = join(outputDir, "../src/assets");
            mkdirSync(srcLogoDir, { recursive: true });
            const logoDest = join(srcLogoDir, "logo.svg");
            const logoTextDest = join(srcLogoDir, "logo-text.svg");
            console.log(`  Copying logo → ${logoDest}`);
            console.log(`  Copying logo-text → ${logoTextDest}`);

            const logoContent = readFileSync(appConfig.sourceSvg, "utf8")
                .replace(/fill="#000000"/g, 'fill="currentColor"')
                .replace(/fill:#000000/g, "fill:currentColor")
                .replace(/fill="#fff"/g, 'fill="currentColor"')
                .replace(/fill:#fff/g, "fill:currentColor");

            const logoTextContent = readFileSync(
                join(__dirname, appConfig.ogSourceSvg),
                "utf8",
            )
                .replace(/fill="#fff"/g, 'fill="currentColor"')
                .replace(/fill:#fff/g, "fill:currentColor");

            writeFileSync(logoDest, logoContent);
            writeFileSync(logoTextDest, logoTextContent);
        }

        console.log(`\n✅ Done generating assets for ${appConfig.name}`);
    } catch (error) {
        console.error(
            `\n❌ Error generating assets for ${appConfig.name}:`,
            error.message,
        );
        throw error;
    }
}

/**
 * Main execution
 */
async function main() {
    console.log("🚀 PWA Asset Generator");
    console.log("======================");

    try {
        if (targetApp === "all") {
            for (const [key, config] of Object.entries(APPS)) {
                await generateAssetsForApp(key, config);
            }
        } else if (APPS[targetApp]) {
            await generateAssetsForApp(targetApp, APPS[targetApp]);
        } else {
            console.error(`❌ Unknown app: ${targetApp}`);
            console.log("Available apps: enter, pollinations, all");
            process.exit(1);
        }

        console.log("\n🎉 All assets generated successfully!");
    } catch (error) {
        console.error("❌ Error generating assets:", error);
        process.exit(1);
    }
}

main();
