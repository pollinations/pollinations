#!/usr/bin/env node
import { generateImageUrl, generateImage, generateAudio, listModels } from './src/index.js';
import fs from 'fs';
import path from 'path';

// Function to test all Pollinations API functions
async function testPollinationsAPI() {
  console.log('Starting Pollinations API tests...');
  
  try {
    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    
    // Test generateImageUrl function
    console.log('\n1. Testing generateImageUrl function...');
    const urlResult = await generateImageUrl('A beautiful sunset over the ocean', {
      width: 512,
      height: 512
    });
    
    console.log('Image URL result:');
    console.log(JSON.stringify(urlResult, null, 2));
    
    // Test generateImage function
    console.log('\n2. Testing generateImage function...');
    console.log('This may take a moment as we need to fetch the actual image...');
    
    const imageResult = await generateImage('A cute cat playing with a ball of yarn', {
      width: 512,
      height: 512
    });
    
    // Save the image to a file
    const imageData = imageResult.data;
    const mimeType = imageResult.mimeType;
    const extension = mimeType.split('/')[1] || 'png';
    
    const imagePath = path.join(outputDir, `test-image.${extension}`);
    fs.writeFileSync(imagePath, Buffer.from(imageData, 'base64'));
    
    console.log(`Image saved to: ${imagePath}`);
    console.log('Image metadata:', imageResult.metadata);
    
    // Test generateAudio function
    console.log('\n3. Testing generateAudio function...');
    console.log('This may take a moment as we need to generate and fetch the audio...');
    
    const audioResult = await generateAudio('Hello, world! This is a test of the Pollinations audio API.', {
      voice: 'alloy'
    });
    
    // Save the audio to a file
    const audioData = audioResult.data;
    const audioMimeType = audioResult.mimeType;
    const audioExtension = audioMimeType.includes('mpeg') ? 'mp3' : 'wav';
    
    const audioPath = path.join(outputDir, `test-audio.${audioExtension}`);
    fs.writeFileSync(audioPath, Buffer.from(audioData, 'base64'));
    
    console.log(`Audio saved to: ${audioPath}`);
    console.log('Audio metadata:', audioResult.metadata);
    
    // Test listModels function for image models
    console.log('\n4. Testing listModels function (image models)...');
    const imageModelsResult = await listModels('image');
    console.log('Available image models:');
    console.log(JSON.stringify(imageModelsResult, null, 2));
    
    // Test listModels function for text models
    console.log('\n5. Testing listModels function (text models)...');
    const textModelsResult = await listModels('text');
    console.log('Available text models:');
    console.log(JSON.stringify(textModelsResult, null, 2));
    
    console.log('\nAll tests completed successfully!');
    console.log(`Test outputs saved to: ${outputDir}`);
  } catch (error) {
    console.error('Error during test:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the tests
testPollinationsAPI().catch(console.error);
