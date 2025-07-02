#!/usr/bin/env node

/**
 * Simple script to skip 1 million entries and download images with model_gptimage
 */

import fs from 'fs';
import path from 'path';

// Configuration
const WORKER_URL = 'https://temp-r2-explorer.thomash-efd.workers.dev';
const SKIP_COUNT = 1000000; // Skip first million entries
const SKIP_BATCH_SIZE = 10000; // Skip in smaller batches to avoid timeouts
const MAX_DOWNLOADS = 50;
const OUTPUT_DIR = './downloads';

async function main() {
  console.log('🚀 Starting download script...');
  console.log(`📍 Skipping first ${SKIP_COUNT.toLocaleString()} entries`);
  console.log(`🎯 Looking for objects with 'model_gptimage' in key`);
  console.log(`📊 Max downloads: ${MAX_DOWNLOADS}`);
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Created directory: ${OUTPUT_DIR}`);
  }

  try {
    // Step 1: Skip the first million entries in batches
    console.log(`\n⏭️  Skipping ${SKIP_COUNT.toLocaleString()} objects in batches of ${SKIP_BATCH_SIZE.toLocaleString()}...`);
    
    let totalSkipped = 0;
    let cursor = null;
    
    while (totalSkipped < SKIP_COUNT) {
      const remainingToSkip = SKIP_COUNT - totalSkipped;
      const currentBatchSize = Math.min(SKIP_BATCH_SIZE, remainingToSkip);
      
      console.log(`⏭️  Skipping batch: ${currentBatchSize.toLocaleString()} objects (total: ${totalSkipped.toLocaleString()})...`);
      
      const skipUrl = `${WORKER_URL}?action=skip&skipCount=${currentBatchSize}${cursor ? `&cursor=${cursor}` : ''}`;
      const skipResponse = await fetch(skipUrl);
      
      if (!skipResponse.ok) {
        throw new Error(`Skip request failed: ${skipResponse.status} ${skipResponse.statusText}`);
      }
      
      const skipData = await skipResponse.json();
      
      if (!skipData || typeof skipData.skipped === 'undefined') {
        throw new Error(`Invalid skip response: ${JSON.stringify(skipData)}`);
      }
      
      totalSkipped += skipData.skipped;
      cursor = skipData.cursor;
      
      if (skipData.skipped < currentBatchSize) {
        console.log(`⚠️  Reached end of bucket at ${totalSkipped.toLocaleString()} objects`);
        break;
      }
    }
    
    console.log(`✅ Total skipped: ${totalSkipped.toLocaleString()} objects`);
    
    // Now get objects from this cursor position
    const finalListResponse = await fetch(`${WORKER_URL}?action=list&limit=100${cursor ? `&cursor=${cursor}` : ''}`);
    if (!finalListResponse.ok) {
      throw new Error(`Final list request failed: ${finalListResponse.status} ${finalListResponse.statusText}`);
    }
    
    const finalListData = await finalListResponse.json();
    if (!finalListData || !finalListData.objects) {
      throw new Error(`Invalid final list response`);
    }
    
    console.log(`🔍 Found ${finalListData.objects.length} objects after skip`);
    
    // Update cursor for the main loop
    cursor = finalListData.cursor;
    
    // Step 2: Filter for gptimage objects and download
    let downloadCount = 0;
    
    while (downloadCount < MAX_DOWNLOADS && cursor) {
      console.log(`\n📋 Fetching batch starting from cursor...`);
      
      // Get a batch of objects
      const listResponse = await fetch(`${WORKER_URL}?action=list&limit=100&cursor=${cursor}`);
      
      if (!listResponse.ok) {
        console.log(`❌ List request failed: ${listResponse.status} ${listResponse.statusText}`);
        break;
      }
      
      const listData = await listResponse.json();
      
      if (!listData || !listData.objects) {
        console.log(`❌ Invalid list response: ${JSON.stringify(listData)}`);
        break;
      }
      
      console.log(`📦 Got ${listData.objects.length} objects in batch`);
      
      // Filter for gptimage objects
      const gptimageObjects = listData.objects.filter(obj => 
        obj.key.includes('model_gptimage')
      );
      
      console.log(`🎯 Found ${gptimageObjects.length} gptimage objects in this batch`);
      
      // Download each gptimage object
      for (const obj of gptimageObjects) {
        if (downloadCount >= MAX_DOWNLOADS) break;
        
        console.log(`\n📥 Downloading ${downloadCount + 1}/${MAX_DOWNLOADS}: ${obj.key.substring(0, 80)}...`);
        
        try {
          // Get the object data (our worker returns the object as JSON)
          const downloadResponse = await fetch(`${WORKER_URL}?action=download&key=${encodeURIComponent(obj.key)}`);
          
          if (!downloadResponse.ok) {
            console.log(`❌ Failed to download: ${downloadResponse.status}`);
            continue;
          }
          
          const objectData = await downloadResponse.json();
          
          // The object body is in objectData.body (as ArrayBuffer)
          if (!objectData.body) {
            console.log(`❌ No body data in response`);
            continue;
          }
          
          // Save image - the body comes as base64 or buffer
          const filename = `gptimage_${downloadCount + 1}_${Date.now()}.jpg`;
          const filepath = path.join(OUTPUT_DIR, filename);
          
          // Convert body to buffer and save
          let imageBuffer;
          if (typeof objectData.body === 'string') {
            // If base64 string
            imageBuffer = Buffer.from(objectData.body, 'base64');
          } else {
            // If already buffer/array
            imageBuffer = Buffer.from(objectData.body);
          }
          
          fs.writeFileSync(filepath, imageBuffer);
          
          // Save raw object metadata (thin proxy principle)
          const metadataFilename = `${filename}.json`;
          const metadataPath = path.join(OUTPUT_DIR, metadataFilename);
          fs.writeFileSync(metadataPath, JSON.stringify(objectData, null, 2));
          
          console.log(`✅ Saved: ${filename} (${(obj.size / 1024 / 1024).toFixed(2)} MB)`);
          downloadCount++;
          
        } catch (error) {
          console.log(`❌ Error downloading ${obj.key}: ${error.message}`);
        }
      }
      
      // Move to next batch
      if (!listData.truncated || !listData.cursor) {
        console.log(`\n🏁 Reached end of objects`);
        break;
      }
      
      cursor = listData.cursor;
    }
    
    console.log(`\n🎉 Download complete!`);
    console.log(`📊 Downloaded ${downloadCount} images to ${OUTPUT_DIR}`);
    
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  }
}

main().catch(console.error);
