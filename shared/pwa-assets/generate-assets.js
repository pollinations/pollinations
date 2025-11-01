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
async function generateIcon(svgBuffer, size, outputPath, backgroundColor) {
  console.log(`  Generating ${size}x${size} → ${outputPath}`);
  
  const background = resolveBackground(backgroundColor);
  
  await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .flatten({ background })
    .png()
    .toFile(outputPath);
}

/**
 * Generate favicon.ico (32x32 PNG)
 */
async function generateFavicon(svgBuffer, outputPath, backgroundColor) {
  console.log(`  Generating favicon.ico → ${outputPath}`);
  
  const background = resolveBackground(backgroundColor);
  
  await sharp(svgBuffer)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .flatten({ background })
    .png()
    .toFile(outputPath);
}

/**
 * Generate OG image (social media preview)
 */
async function generateOGImage(svgBuffer, outputPath, backgroundColor, textLogoBuffer = null) {
  console.log(`  Generating OG image 1200x630 → ${outputPath}`);
  
  const width = 1200;
  const height = 630;
  const background = resolveBackground(backgroundColor);
  const logoSource = textLogoBuffer || svgBuffer;
  const logoWidth = Math.floor(width * 0.7);
  
  // Create colored background
  const backgroundImage = await sharp({
    create: { width, height, channels: 4, background }
  }).png().toBuffer();
  
  // Resize logo
  const logo = await sharp(logoSource)
    .resize(logoWidth, null, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
    
  const logoMetadata = await sharp(logo).metadata();
  
  // Composite logo on background
  await sharp(backgroundImage)
    .composite([{
      input: logo,
      top: Math.floor((height - logoMetadata.height) / 2),
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
    const theme = appConfig.themeColor;
    
    // Ensure output directory exists
    mkdirSync(outputDir, { recursive: true });
  
  // Generate favicons
  console.log('\n🎨 Favicons:');
  for (const size of ICON_SIZES.favicons) {
    await generateIcon(svgBuffer, size, join(outputDir, `favicon-${size}x${size}.png`), theme);
  }
  await generateFavicon(svgBuffer, join(outputDir, 'favicon.ico'), theme);
  
  // Generate PWA icons
  console.log('\n📱 PWA Icons:');
  for (const size of ICON_SIZES.pwa) {
    await generateIcon(svgBuffer, size, join(outputDir, `icon-${size}.png`), theme);
  }
  
  // Generate Apple touch icons
  console.log('\n🍎 Apple Icons:');
  for (const size of ICON_SIZES.apple) {
    const filename = size === 180 
      ? 'apple-touch-icon.png'
      : `apple-touch-icon-${size}x${size}.png`;
    await generateIcon(svgBuffer, size, join(outputDir, filename), theme);
  }
  
  // Generate OG image (only for enter and pollinations)
  if (appKey === 'enter' || appKey === 'pollinations') {
    console.log('\n🖼️  Social Media:');
    const ogSource = appConfig.ogSourceSvg ? join(__dirname, appConfig.ogSourceSvg) : null;
    const ogBuffer = ogSource ? readFileSync(ogSource) : null;
    await generateOGImage(svgBuffer, join(outputDir, 'og-image.png'), theme, ogBuffer);
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
