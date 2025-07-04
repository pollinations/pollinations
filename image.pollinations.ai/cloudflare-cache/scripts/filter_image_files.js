#!/usr/bin/env node

/**
 * Filter files that have originalKey containing "_image_"
 * This identifies image-to-image generation requests vs text-only requests
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const DOWNLOADS_DIR = './downloads/sampled-gptimages';

async function main() {
  console.log('🔍 Filtering files with "_image_" in originalKey...\n');
  
  if (!existsSync(DOWNLOADS_DIR)) {
    console.error(`❌ Directory not found: ${DOWNLOADS_DIR}`);
    process.exit(1);
  }
  
  const files = readdirSync(DOWNLOADS_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`📁 Found ${jsonFiles.length} JSON files to check`);
  console.log(`📁 Total files in directory: ${files.length}\n`);
  
  const imageToImageFiles = [];
  const textOnlyFiles = [];
  
  for (const jsonFile of jsonFiles) {
    try {
      const jsonPath = join(DOWNLOADS_DIR, jsonFile);
      const content = readFileSync(jsonPath, 'utf8');
      const metadata = JSON.parse(content);
      
      const originalKey = metadata.originalKey || '';
      const filename = metadata.filename || jsonFile.replace('.json', '');
      if (originalKey.includes('_image_')) {
        imageToImageFiles.push({
          json: jsonFile,
          image: filename,
          originalKey: originalKey
        });
      } else {
        textOnlyFiles.push({
          json: jsonFile,
          image: filename,
          originalKey: originalKey
        });
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${jsonFile}: ${error.message}`);
    }
  }
  
  console.log('📊 RESULTS SUMMARY:');
  console.log('='.repeat(50));
  console.log(`🖼️  Image-to-Image files: ${imageToImageFiles.length}`);
  console.log(`📝 Text-only files: ${textOnlyFiles.length}`);
  console.log(`📋 Total processed: ${imageToImageFiles.length + textOnlyFiles.length}`);
  
  console.log('\n🖼️  IMAGE-TO-IMAGE FILES (contain "_image_"):');
  console.log('='.repeat(50));
  
  imageToImageFiles.forEach((file, index) => {
    console.log(`${index + 1}. ${file.image}`);
    // Show a snippet of the originalKey to see the image URL
    const keySnippet = file.originalKey.substring(0, 100);
    console.log(`   Key: ${keySnippet}...`);
    
    // Try to extract the image URL
    const imageUrlMatch = file.originalKey.match(/image_([^&_]+)/);
    if (imageUrlMatch) {
      const encodedUrl = imageUrlMatch[1];
      try {
        const decodedUrl = decodeURIComponent(encodedUrl);
        console.log(`   📷 Reference: ${decodedUrl}`);
      } catch (e) {
        console.log(`   📷 Reference: ${encodedUrl} (encoded)`);
      }
    }
    console.log('');
  });
  
  if (imageToImageFiles.length === 0) {
    console.log('   (No image-to-image files found)');
  }
  
  console.log('\n📝 TEXT-ONLY FILES (sample - first 10):');
  console.log('='.repeat(50));
  
  textOnlyFiles.slice(0, 10).forEach((file, index) => {
    console.log(`${index + 1}. ${file.image}`);
    const keySnippet = file.originalKey.substring(0, 80);
    console.log(`   Key: ${keySnippet}...`);
    console.log('');
  });
  
  if (textOnlyFiles.length > 10) {
    console.log(`   ... and ${textOnlyFiles.length - 10} more text-only files`);
  }
  
  // Save image-to-image file list
  if (imageToImageFiles.length > 0) {
    const listFile = './image_to_image_files.txt';
    const fileList = imageToImageFiles.map(f => f.image).join('\n');
    
    try {
      import('fs').then(fs => {
        fs.writeFileSync(listFile, fileList);
        console.log(`\n💾 Saved image-to-image file list to: ${listFile}`);
      });
    } catch (error) {
      console.log(`\n❌ Could not save file list: ${error.message}`);
    }
  }
}

main().catch(console.error);
