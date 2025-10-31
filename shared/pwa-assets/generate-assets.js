#!/usr/bin/env node
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { APP_CONFIGS, resolveBackground } from './app-configs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repository root
const REPO_ROOT = join(__dirname, '../..');

// Build full app configs with resolved paths
const APPS = {};
for (const [key, config] of Object.entries(APP_CONFIGS)) {
  APPS[key] = {
    ...config,
    sourceSvg: join(__dirname, config.sourceSvg),
    outputDir: join(REPO_ROOT, config.outputDir)
  };
}

// Icon sizes to generate
const ICON_SIZES = {
  favicons: [16, 32],
  pwa: [192, 512],
  apple: [180, 152, 167],
  og: { width: 1200, height: 630 }
};

// Parse command line arguments
const args = process.argv.slice(2);
const appArg = args.find(arg => arg.startsWith('--app='));
const targetApp = appArg ? appArg.split('=')[1] : 'all';

/**
 * Generate PNG from SVG at specified size
 */
async function generateIcon(svgBuffer, size, outputPath, backgroundConfig = 'transparent', tintColor = null) {
  console.log(`  Generating ${size}x${size} → ${outputPath}`);
  
  const background = resolveBackground(backgroundConfig);
  
  // First resize the image
  let resized = await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  
  // Apply tint if specified (for colorizing black logos)
  if (tintColor) {
    const tint = resolveBackground(tintColor);
    
    // Extract the alpha channel
    const alphaChannel = await sharp(resized)
      .extractChannel('alpha')
      .toBuffer();
    
    // Create a solid color image with the tint color
    const { width, height } = await sharp(resized).metadata();
    const coloredImage = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: tint
      }
    })
    .png()
    .toBuffer();
    
    // Composite the colored image using the alpha channel as a mask
    resized = await sharp(coloredImage)
      .joinChannel(alphaChannel)
      .toBuffer();
  }
  
  // If background is opaque, flatten the image
  if (background.alpha === 1) {
    resized = await sharp(resized)
      .flatten({ background })
      .toBuffer();
  }
  
  await sharp(resized).png().toFile(outputPath);
}

/**
 * Generate maskable icon (with safe zone padding)
 */
async function generateMaskableIcon(svgBuffer, size, outputPath, backgroundConfig = '#000000') {
  console.log(`  Generating ${size}x${size} maskable → ${outputPath}`);
  
  // Maskable icons need 20% padding (safe zone)
  const paddedSize = Math.floor(size * 0.8);
  const padding = Math.floor((size - paddedSize) / 2);
  
  const background = resolveBackground(backgroundConfig);
  
  // Create icon with padding
  await sharp(svgBuffer)
    .resize(paddedSize, paddedSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background
    })
    .png()
    .toFile(outputPath);
}

/**
 * Generate ICO file (multi-resolution)
 */
async function generateFavicon(svgBuffer, outputPath, backgroundConfig = 'transparent', tintColor = null) {
  console.log(`  Generating favicon.ico → ${outputPath}`);
  
  const size = 32;
  const background = resolveBackground(backgroundConfig);
  
  // First resize the image
  let resized = await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background })
    .toBuffer();
  
  // Apply tint if specified
  if (tintColor) {
    const tint = resolveBackground(tintColor);
    
    // Extract the alpha channel
    const alphaChannel = await sharp(resized)
      .extractChannel('alpha')
      .toBuffer();
    
    // Create a solid color image with the tint color
    const { width, height } = await sharp(resized).metadata();
    const coloredImage = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: tint
      }
    })
    .png()
    .toBuffer();
    
    // Composite the colored image using the alpha channel as a mask
    resized = await sharp(coloredImage)
      .joinChannel(alphaChannel)
      .toBuffer();
  }
  
  // If background is opaque, flatten the image
  if (background.alpha === 1) {
    resized = await sharp(resized)
      .flatten({ background })
      .toBuffer();
  }
  
  // Note: sharp doesn't support ICO directly, so we generate PNG
  // For now, we'll generate a 32x32 PNG and rename it
  // A proper ICO converter could be added later if needed
  await sharp(resized).toFile(outputPath);
}

/**
 * Generate OG image (social media preview)
 */
async function generateOGImage(svgBuffer, outputPath, width = 1200, height = 630, backgroundConfig = '#000000') {
  console.log(`  Generating OG image ${width}x${height} → ${outputPath}`);
  
  // Scale logo to fit within OG image dimensions (with padding)
  const logoHeight = Math.floor(height * 0.5); // Logo takes 50% of height
  
  const background = resolveBackground(backgroundConfig);
  
  await sharp(svgBuffer)
    .resize(null, logoHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: Math.floor((height - logoHeight) / 2),
      bottom: Math.floor((height - logoHeight) / 2),
      left: Math.floor((width - (logoHeight * 2)) / 2),
      right: Math.floor((width - (logoHeight * 2)) / 2),
      background
    })
    .png()
    .toFile(outputPath);
}

/**
 * Generate all assets for an app
 */
async function generateAssetsForApp(appKey, appConfig) {
  console.log(`\n📦 Generating assets for ${appConfig.name}...`);
  console.log(`   Source: ${appConfig.sourceSvg}`);
  
  const svgBuffer = readFileSync(appConfig.sourceSvg);
  const outputDir = appConfig.outputDir;
  const iconConfig = appConfig.icons || {};
  
  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });
  
  // Generate favicons
  console.log('\n🎨 Favicons:');
  const faviconBg = iconConfig.favicons?.background || 'transparent';
  const faviconTint = iconConfig.favicons?.tint || null;
  for (const size of ICON_SIZES.favicons) {
    await generateIcon(svgBuffer, size, join(outputDir, `favicon-${size}x${size}.png`), faviconBg, faviconTint);
  }
  await generateFavicon(svgBuffer, join(outputDir, 'favicon.ico'), faviconBg, faviconTint);
  
  // Generate PWA icons (standard + maskable)
  console.log('\n📱 PWA Icons:');
  const pwaBg = iconConfig.pwa?.background || '#000000';
  const maskableBg = iconConfig.maskable?.background || '#000000';
  
  for (const size of ICON_SIZES.pwa) {
    // Standard icon
    const standardName = appKey === 'pollinations' 
      ? `android-chrome-${size}x${size}.png`  // pollinations.ai uses android-chrome naming
      : `icon-${size}.png`;                     // enter/auth use icon naming
    await generateIcon(svgBuffer, size, join(outputDir, standardName), pwaBg);
    
    // Maskable icon
    await generateMaskableIcon(svgBuffer, size, join(outputDir, `icon-${size}-maskable.png`), maskableBg);
  }
  
  // Generate Apple touch icons
  console.log('\n🍎 Apple Icons:');
  const appleBg = iconConfig.apple?.background || '#000000';
  for (const size of ICON_SIZES.apple) {
    const filename = size === 180 
      ? 'apple-touch-icon.png'  // Primary icon
      : `apple-touch-icon-${size}x${size}.png`;
    await generateIcon(svgBuffer, size, join(outputDir, filename), appleBg);
  }
  
  // Generate OG image (only for enter and pollinations)
  if (appKey === 'enter' || appKey === 'pollinations') {
    console.log('\n🖼️  Social Media:');
    const ogBg = iconConfig.og?.background || '#000000';
    await generateOGImage(svgBuffer, join(outputDir, 'og-image.png'), 
      ICON_SIZES.og.width, ICON_SIZES.og.height, ogBg);
  }
  
  console.log(`\n✅ Done generating assets for ${appConfig.name}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 PWA Asset Generator');
  console.log('======================');
  
  try {
    if (targetApp === 'all') {
      for (const [key, config] of Object.entries(APPS)) {
        await generateAssetsForApp(key, config);
      }
    } else if (APPS[targetApp]) {
      await generateAssetsForApp(targetApp, APPS[targetApp]);
    } else {
      console.error(`❌ Unknown app: ${targetApp}`);
      console.log('Available apps: enter, pollinations, auth, all');
      process.exit(1);
    }
    
    console.log('\n🎉 All assets generated successfully!');
    console.log('\nNext steps:');
    console.log('1. Update manifest files with new icon references');
    console.log('2. Update HTML files with meta tags');
    console.log('3. Remove old manually-created assets');
    
  } catch (error) {
    console.error('❌ Error generating assets:', error);
    process.exit(1);
  }
}

main();
