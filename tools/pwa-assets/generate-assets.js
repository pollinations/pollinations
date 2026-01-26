#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { APP_CONFIGS, resolveBackground } from "./app-configs.js";

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
    og: { width: 1200, height: 630 },
};

// Parse command line arguments
const args = process.argv.slice(2);
const appArg = args.find((arg) => arg.startsWith("--app="));
const targetApp = appArg ? appArg.split("=")[1] : "all";

/**
 * Generate PNG from SVG at specified size
 */
async function generateIcon(
    svgBuffer,
    size,
    outputPath,
    backgroundColor,
    tintColor,
) {
    console.log(`  Generating ${size}x${size} → ${outputPath}`);

    const background = resolveBackground(backgroundColor);

    // Tint the SVG if a tint color is provided
    let inputBuffer = svgBuffer;
    if (tintColor) {
        const svgString = svgBuffer
            .toString()
            .replace(/fill="#fff"/g, `fill="${tintColor}"`)
            .replace(/fill:#fff/g, `fill:${tintColor}`);
        inputBuffer = Buffer.from(svgString);
    }

    let pipeline = sharp(inputBuffer).resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

    // Only flatten if background is not transparent
    if (background.alpha !== 0) {
        pipeline = pipeline.flatten({ background });
    }

    await pipeline.png().toFile(outputPath);
}

/**
 * Generate favicon.ico (32x32 PNG)
 */
async function generateFavicon(
    svgBuffer,
    outputPath,
    backgroundColor,
    tintColor,
) {
    console.log(`  Generating favicon.ico → ${outputPath}`);

    const background = resolveBackground(backgroundColor);

    // Tint the SVG if a tint color is provided
    let inputBuffer = svgBuffer;
    if (tintColor) {
        const svgString = svgBuffer
            .toString()
            .replace(/fill="#fff"/g, `fill="${tintColor}"`)
            .replace(/fill:#fff/g, `fill:${tintColor}`);
        inputBuffer = Buffer.from(svgString);
    }

    let pipeline = sharp(inputBuffer).resize(32, 32, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

    // Only flatten if background is not transparent
    if (background.alpha !== 0) {
        pipeline = pipeline.flatten({ background });
    }

    await pipeline.png().toFile(outputPath);
}

/**
 * Generate watermark logo with transparency preserved (for image.pollinations.ai)
 */
async function generateWatermarkLogo(svgBuffer, outputPath, width, height) {
    console.log(
        `  Generating watermark ${width}x${height} with transparency → ${outputPath}`,
    );

    await sharp(svgBuffer)
        .resize(width, height, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toFile(outputPath);
}

/**
 * Generate OG image (social media preview)
 */
async function generateOGImage(
    svgBuffer,
    outputPath,
    backgroundColor,
    textLogoBuffer = null,
    tintColor = null,
) {
    console.log(`  Generating OG image 1200x630 → ${outputPath}`);

    const width = 1200;
    const height = 630;
    const background = resolveBackground(backgroundColor);

    let logoSource = textLogoBuffer || svgBuffer;

    // Tint the logo if needed
    if (tintColor && logoSource) {
        const svgString = logoSource
            .toString()
            .replace(/fill="#fff"/g, `fill="${tintColor}"`)
            .replace(/fill:#fff/g, `fill:${tintColor}`);
        logoSource = Buffer.from(svgString);
    }

    const logoWidth = Math.floor(width * 0.7);

    // Create colored background
    const backgroundImage = await sharp({
        create: { width, height, channels: 4, background },
    })
        .png()
        .toBuffer();

    // Resize logo
    const logo = await sharp(logoSource)
        .resize(logoWidth, null, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .toBuffer();

    const logoMetadata = await sharp(logo).metadata();

    // Composite logo on background
    await sharp(backgroundImage)
        .composite([
            {
                input: logo,
                top: Math.floor((height - logoMetadata.height) / 2),
                left: Math.floor((width - logoMetadata.width) / 2),
            },
        ])
        .png()
        .toFile(outputPath);
}

/**
 * Generate all assets for an app
 */
async function generateAssetsForApp(appKey, appConfig) {
    console.log(`\n📦 Generating assets for ${appConfig.name}...`);
    console.log(`   Source: ${appConfig.sourceSvg}`);

    try {
        const svgBuffer = readFileSync(appConfig.sourceSvg);
        const outputDir = appConfig.outputDir;
        const theme = appConfig.themeColor;

        // Determine backgrounds and tints
        // Icons: Use iconBackground if set, otherwise fallback to backgroundColor or theme
        const iconBg = resolveBackground(
            appConfig.iconBackground || appConfig.backgroundColor || theme,
        );
        // Tint icons if background is transparent (assuming we want colored logo on transparent)
        // OR if explicitly requested. For now, if iconBackground is transparent, we tint with theme.
        const iconTint =
            appConfig.iconBackground === "transparent" ? theme : null;

        // OG Image: Use backgroundColor if set, otherwise theme
        const ogBg = resolveBackground(appConfig.backgroundColor || theme);
        // OG Tint: Keep white (null) for banners as requested
        const ogTint = null;

        // Ensure output directory exists
        mkdirSync(outputDir, { recursive: true });

        // Handle image service watermark generation (special case)
        if (appKey === "image" && appConfig.watermark?.enabled) {
            console.log("\n🏷️  Watermark Logo:");
            await generateWatermarkLogo(
                svgBuffer,
                join(outputDir, "logo.png"),
                appConfig.watermark.width,
                appConfig.watermark.height,
            );
            console.log(`\n✅ Done generating watermark for ${appConfig.name}`);
            return;
        }

        // Generate favicons
        console.log("\n🎨 Favicons:");
        for (const size of ICON_SIZES.favicons) {
            await generateIcon(
                svgBuffer,
                size,
                join(outputDir, `favicon-${size}x${size}.png`),
                iconBg,
                iconTint,
            );
        }
        await generateFavicon(
            svgBuffer,
            join(outputDir, "favicon.ico"),
            iconBg,
            iconTint,
        );

        // Generate PWA icons
        console.log("\n📱 PWA Icons:");
        for (const size of ICON_SIZES.pwa) {
            await generateIcon(
                svgBuffer,
                size,
                join(outputDir, `icon-${size}.png`),
                iconBg,
                iconTint,
            );
        }

        // Generate Apple touch icons
        console.log("\n🍎 Apple Icons:");
        for (const size of ICON_SIZES.apple) {
            const filename =
                size === 180
                    ? "apple-touch-icon.png"
                    : `apple-touch-icon-${size}x${size}.png`;
            await generateIcon(
                svgBuffer,
                size,
                join(outputDir, filename),
                iconBg,
                iconTint,
            );
        }

        // Generate OG image (only for enter, pollinations, and hello)
        if (
            appKey === "enter" ||
            appKey === "pollinations" ||
            appKey === "hello"
        ) {
            console.log("\n🖼️  Social Media:");
            const ogSource = appConfig.ogSourceSvg
                ? join(__dirname, appConfig.ogSourceSvg)
                : null;
            const ogBuffer = ogSource ? readFileSync(ogSource) : null;
            await generateOGImage(
                svgBuffer,
                join(outputDir, "og-image.png"),
                ogBg,
                ogBuffer,
                ogTint,
            );
        }

        // Copy source SVGs for direct use
        console.log("\n📋 Copying Source SVGs:");
        if (appKey === "enter") {
            const logoTextSource = join(__dirname, appConfig.ogSourceSvg);
            const logoTextDest = join(outputDir, "logo_text_black.svg");
            console.log(`  Copying logo-text → ${logoTextDest}`);
            // Use writeFileSync for exact copy (sharp modifies SVG)
            writeFileSync(logoTextDest, readFileSync(logoTextSource));
        } else if (appKey === "pollinations" || appKey === "hello") {
            // Copy both logos to src/assets for React imports
            const srcLogoDir = join(outputDir, "../src/assets");
            mkdirSync(srcLogoDir, { recursive: true });
            const logoDest = join(srcLogoDir, "logo.svg");
            const logoTextDest = join(srcLogoDir, "logo-text.svg");
            console.log(`  Copying logo → ${logoDest}`);
            console.log(`  Copying logo-text → ${logoTextDest}`);

            // Read and replace fill with currentColor for React usage
            // Regex handles both fill="#fff" (attribute) and fill:#fff (inline style)
            const logoContent = readFileSync(appConfig.sourceSvg, "utf8")
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
        } else if (appKey === "gsoc") {
            // Copy logo-text to public for direct use
            const logoTextSource = join(__dirname, appConfig.ogSourceSvg);
            const logoTextDest = join(outputDir, "logo-text.svg");
            console.log(`  Copying logo-text → ${logoTextDest}`);
            writeFileSync(logoTextDest, readFileSync(logoTextSource));
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
            console.log(
                "Available apps: enter, pollinations, pollinations2, image, all",
            );
            process.exit(1);
        }

        console.log("\n🎉 All assets generated successfully!");
        console.log("\nNext steps:");
        console.log("1. Update manifest files with new icon references");
        console.log("2. Update HTML files with meta tags");
        console.log("3. Remove old manually-created assets");
    } catch (error) {
        console.error("❌ Error generating assets:", error);
        process.exit(1);
    }
}

main();
