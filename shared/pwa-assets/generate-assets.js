#!/usr/bin/env node
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const SOURCE_SVG = join(__dirname, 'source.svg');
const REPO_ROOT = join(__dirname, '../..');

const APPS = {
  enter: {
    name: 'enter.pollinations.ai',
    outputDir: join(REPO_ROOT, 'enter.pollinations.ai/public'),
    themeColor: '#000000',
    backgroundColor: '#000000'
  },
  pollinations: {
    name: 'pollinations.ai',
    outputDir: join(REPO_ROOT, 'pollinations.ai/public'),
    themeColor: '#000000',
    backgroundColor: '#000000'
  },
  auth: {
    name: 'auth.pollinations.ai',
    outputDir: join(REPO_ROOT, 'auth.pollinations.ai/media'),
    themeColor: '#000000',
    backgroundColor: '#000000'
  }
};

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
async function generateIcon(svgBuffer, size, outputPath, background = null) {
  console.log(`  Generating ${size}x${size} → ${outputPath}`);
  
  let pipeline = sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  
  if (background) {
    pipeline = pipeline.flatten({ background });
  }
  
  await pipeline.png().toFile(outputPath);
}

/**
 * Generate maskable icon (with safe zone padding)
 */
async function generateMaskableIcon(svgBuffer, size, outputPath) {
  console.log(`  Generating ${size}x${size} maskable → ${outputPath}`);
  
  // Maskable icons need 20% padding (safe zone)
  const paddedSize = Math.floor(size * 0.8);
  const padding = Math.floor((size - paddedSize) / 2);
  
  // Create icon with padding
  await sharp(svgBuffer)
    .resize(paddedSize, paddedSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    })
    .png()
    .toFile(outputPath);
}

/**
 * Generate ICO file (multi-resolution)
 */
async function generateFavicon(svgBuffer, outputPath) {
  console.log(`  Generating favicon.ico → ${outputPath}`);
  
  // Generate 32x32 as ICO (most common size)
  await sharp(svgBuffer)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath.replace('.ico', '-temp.png'));
  
  // Note: sharp doesn't support ICO directly, so we generate PNG
  // For now, we'll generate a 32x32 PNG and rename it
  // A proper ICO converter could be added later if needed
  await sharp(svgBuffer)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(outputPath);
}

/**
 * Generate OG image (social media preview)
 */
async function generateOGImage(svgBuffer, outputPath, width = 1200, height = 630) {
  console.log(`  Generating OG image ${width}x${height} → ${outputPath}`);
  
  // Scale logo to fit within OG image dimensions (with padding)
  const logoHeight = Math.floor(height * 0.5); // Logo takes 50% of height
  
  await sharp(svgBuffer)
    .resize(null, logoHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: Math.floor((height - logoHeight) / 2),
      bottom: Math.floor((height - logoHeight) / 2),
      left: Math.floor((width - (logoHeight * 2)) / 2),
      right: Math.floor((width - (logoHeight * 2)) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    })
    .png()
    .toFile(outputPath);
}

/**
 * Generate all assets for an app
 */
async function generateAssetsForApp(appKey, appConfig) {
  console.log(`\n📦 Generating assets for ${appConfig.name}...`);
  
  const svgBuffer = readFileSync(SOURCE_SVG);
  const outputDir = appConfig.outputDir;
  
  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });
  
  // Generate favicons
  console.log('\n🎨 Favicons:');
  for (const size of ICON_SIZES.favicons) {
    await generateIcon(svgBuffer, size, join(outputDir, `favicon-${size}x${size}.png`));
  }
  await generateFavicon(svgBuffer, join(outputDir, 'favicon.ico'));
  
  // Generate PWA icons (standard + maskable)
  console.log('\n📱 PWA Icons:');
  for (const size of ICON_SIZES.pwa) {
    // Standard icon
    const standardName = appKey === 'pollinations' 
      ? `android-chrome-${size}x${size}.png`  // pollinations.ai uses android-chrome naming
      : `icon-${size}.png`;                     // enter/auth use icon naming
    await generateIcon(svgBuffer, size, join(outputDir, standardName));
    
    // Maskable icon
    await generateMaskableIcon(svgBuffer, size, join(outputDir, `icon-${size}-maskable.png`));
  }
  
  // Generate Apple touch icons
  console.log('\n🍎 Apple Icons:');
  for (const size of ICON_SIZES.apple) {
    const filename = size === 180 
      ? 'apple-touch-icon.png'  // Primary icon
      : `apple-touch-icon-${size}x${size}.png`;
    await generateIcon(svgBuffer, size, join(outputDir, filename));
  }
  
  // Generate OG image (only for enter and pollinations)
  if (appKey === 'enter' || appKey === 'pollinations') {
    console.log('\n🖼️  Social Media:');
    await generateOGImage(svgBuffer, join(outputDir, 'og-image.png'), 
      ICON_SIZES.og.width, ICON_SIZES.og.height);
  }
  
  console.log(`\n✅ Done generating assets for ${appConfig.name}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 PWA Asset Generator');
  console.log('======================');
  console.log(`Source: ${SOURCE_SVG}`);
  
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
