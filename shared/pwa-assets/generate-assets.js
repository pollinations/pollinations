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
 * Apply color tint to an image (e.g., black → white)
 */
async function applyColorTint(buffer, tintColor) {
  const tint = resolveBackground(tintColor);
  
  // Extract the alpha channel
  const alphaChannel = await sharp(buffer)
    .extractChannel('alpha')
    .toBuffer();
  
  // Create a solid color image with the tint color
  const { width, height } = await sharp(buffer).metadata();
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
  return await sharp(coloredImage)
    .joinChannel(alphaChannel)
    .toBuffer();
}

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
    resized = await applyColorTint(resized, tintColor);
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
async function generateMaskableIcon(svgBuffer, size, outputPath, backgroundConfig = '#000000', tintColor = null) {
  console.log(`  Generating ${size}x${size} maskable → ${outputPath}`);
  
  // Maskable icons need 20% padding (safe zone)
  const paddedSize = Math.floor(size * 0.8);
  const padding = Math.floor((size - paddedSize) / 2);
  
  const background = resolveBackground(backgroundConfig);
  
  // Resize and optionally tint
  let resized = await sharp(svgBuffer)
    .resize(paddedSize, paddedSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
    
  // Apply tint if specified
  if (tintColor) {
    resized = await applyColorTint(resized, tintColor);
  }
  
  // Create icon with padding
  await sharp(resized)
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
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  
  // Apply tint if specified
  if (tintColor) {
    resized = await applyColorTint(resized, tintColor);
  }
  
  // If background is opaque, flatten the image
  if (background.alpha === 1) {
    resized = await sharp(resized)
      .flatten({ background })
      .toBuffer();
  }
  
  // Generate 32x32 PNG as favicon.ico
  // (Modern browsers support PNG in .ico files)
  await sharp(resized).png().toFile(outputPath);
}

/**
 * Generate OG image (social media preview)
 */
async function generateOGImage(svgBuffer, outputPath, width = 1200, height = 630, backgroundConfig = '#000000', textLogoBuffer = null, tintColor = null) {
  console.log(`  Generating OG image ${width}x${height} → ${outputPath}`);
  
  const background = resolveBackground(backgroundConfig);
  
  // Use text logo if provided, otherwise use regular logo
  const logoSource = textLogoBuffer || svgBuffer;
  
  // For OG images, use 70% of width for better visibility
  const logoWidth = Math.floor(width * 0.7);
  
  // First, create the colored background
  const backgroundImage = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background
    }
  })
  .png()
  .toBuffer();
  
  // Resize logo with transparent background
  let logo = await sharp(logoSource)
    .resize(logoWidth, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
    
  // Apply tint if specified (e.g., black → white)
  if (tintColor) {
    logo = await applyColorTint(logo, tintColor);
  }
  
  // Get logo dimensions to center it
  const logoMetadata = await sharp(logo).metadata();
  const logoHeight = logoMetadata.height;
  
  // Composite logo on top of colored background
  await sharp(backgroundImage)
    .composite([{
      input: logo,
      top: Math.floor((height - logoHeight) / 2),
      left: Math.floor((width - logoMetadata.width) / 2)
    }])
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
    const iconConfig = appConfig.icons || {};
    
    // Ensure output directory exists
    mkdirSync(outputDir, { recursive: true });
  
  // Generate favicons
  console.log('\n🎨 Favicons:');
  const faviconBg = iconConfig.favicons?.background || 'transparent';
  const logoColor = appConfig.logoColor || null;  // Get color transform from config
  for (const size of ICON_SIZES.favicons) {
    await generateIcon(svgBuffer, size, join(outputDir, `favicon-${size}x${size}.png`), faviconBg, logoColor);
  }
  await generateFavicon(svgBuffer, join(outputDir, 'favicon.ico'), faviconBg, logoColor);
  
  // Generate PWA icons (standard + maskable)
  console.log('\n📱 PWA Icons:');
  const pwaBg = iconConfig.pwa?.background || '#000000';
  const maskableBg = iconConfig.maskable?.background || '#000000';
  
  for (const size of ICON_SIZES.pwa) {
    await generateIcon(svgBuffer, size, join(outputDir, `icon-${size}.png`), pwaBg, logoColor);
    await generateMaskableIcon(svgBuffer, size, join(outputDir, `icon-${size}-maskable.png`), maskableBg, logoColor);
  }
  
  // Generate Apple touch icons
  console.log('\n🍎 Apple Icons:');
  const appleBg = iconConfig.apple?.background || '#000000';
  for (const size of ICON_SIZES.apple) {
    const filename = size === 180 
      ? 'apple-touch-icon.png'  // Primary icon
      : `apple-touch-icon-${size}x${size}.png`;
    await generateIcon(svgBuffer, size, join(outputDir, filename), appleBg, logoColor);
  }
  
  // Generate OG image (only for enter and pollinations)
  if (appKey === 'enter' || appKey === 'pollinations') {
    console.log('\n🖼️  Social Media:');
    const ogBg = iconConfig.og?.background || '#000000';
    // Use logo+text SVG for banners
    const ogSource = appConfig.ogSourceSvg ? join(__dirname, appConfig.ogSourceSvg) : null;
    const ogBuffer = ogSource ? readFileSync(ogSource) : null;
    await generateOGImage(svgBuffer, join(outputDir, 'og-image.png'), 
      ICON_SIZES.og.width, ICON_SIZES.og.height, ogBg, ogBuffer, logoColor);
  }
  
  // Copy source SVGs for direct use
  console.log('\n📋 Copying Source SVGs:');
  if (appKey === 'enter') {
    const logoTextSource = join(__dirname, appConfig.ogSourceSvg);
    const logoTextDest = join(outputDir, 'logo_text_black.svg');
    console.log(`  Copying logo-text → ${logoTextDest}`);
    // Use writeFileSync for exact copy (sharp modifies SVG)
    writeFileSync(logoTextDest, readFileSync(logoTextSource));
  } else if (appKey === 'pollinations') {
    // Copy both logos to src/logo for React imports
    const srcLogoDir = join(outputDir, '../src/logo');
    mkdirSync(srcLogoDir, { recursive: true });
    const logoDest = join(srcLogoDir, 'logo.svg');
    const logoTextDest = join(srcLogoDir, 'logo-text.svg');
    console.log(`  Copying logo → ${logoDest}`);
    console.log(`  Copying logo-text → ${logoTextDest}`);
    writeFileSync(logoDest, readFileSync(appConfig.sourceSvg));
    writeFileSync(logoTextDest, readFileSync(appConfig.ogSourceSvg));
  }
  
  console.log(`\n✅ Done generating assets for ${appConfig.name}`);
  } catch (error) {
    console.error(`\n❌ Error generating assets for ${appConfig.name}:`, error.message);
    throw error;
  }
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
