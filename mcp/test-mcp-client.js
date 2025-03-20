#!/usr/bin/env node
import { generateImageUrl, generateImage, listModels } from './src/index.js';
import fs from 'fs';
import path from 'path';

// Function to test the image generation functions
async function testImageGeneration() {
  console.log('Starting image generation test...');
  
  try {
    // Test generateImageUrl function
    console.log('\nTesting generateImageUrl function...');
    const urlResult = await generateImageUrl('A beautiful sunset over the ocean', {
      width: 512,
      height: 512
    });
    
    console.log('Image URL result:');
    console.log(JSON.stringify(urlResult, null, 2));
    
    // Test generateImage function
    console.log('\nTesting generateImage function...');
    console.log('This may take a moment as we need to fetch the actual image...');
    
    const imageResult = await generateImage('A cute cat playing with a ball of yarn', {
      width: 512,
      height: 512
    });
    
    // Save the image to a file
    const imageData = imageResult.data;
    const mimeType = imageResult.mimeType;
    const extension = mimeType.split('/')[1] || 'png';
    
    const outputDir = path.join(process.cwd(), 'test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    
    const outputPath = path.join(outputDir, `test-image.${extension}`);
    fs.writeFileSync(outputPath, Buffer.from(imageData, 'base64'));
    
    console.log(`Image saved to: ${outputPath}`);
    console.log('Image metadata:', imageResult.metadata);
    
    // Test listModels function
    console.log('\nTesting listModels function...');
    const modelsResult = await listModels();
    console.log('Available models:');
    console.log(JSON.stringify(modelsResult, null, 2));
    
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testImageGeneration().catch(console.error);
