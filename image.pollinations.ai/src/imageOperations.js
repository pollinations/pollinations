import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import sanitize from 'sanitize-filename';

// Create a temporary directory for image processing
const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// Safe image operations using sharp instead of child_process
export const processImage = async (buffer, operations = {}) => {
  try {
    let image = sharp(buffer);
    
    // Apply operations
    if (operations.resize) {
      const { width, height, fit } = operations.resize;
      image = image.resize({
        width: parseInt(width) || null,
        height: parseInt(height) || null,
        fit: fit || 'contain'
      });
    }
    
    if (operations.format) {
      image = image.toFormat(operations.format);
    }
    
    if (operations.quality && ['jpeg', 'jpg', 'webp'].includes(operations.format)) {
      image = image.jpeg({ quality: parseInt(operations.quality) });
    }
    
    // Return processed buffer
    return await image.toBuffer();
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error('Failed to process image');
  }
};

// Save image to disk with a safe filename
export const saveImage = async (buffer, filename) => {
  const safeFilename = sanitize(filename || `${uuidv4()}.jpg`);
  const outputPath = path.join(tmpDir, safeFilename);
  
  await fs.promises.writeFile(outputPath, buffer);
  return outputPath;
};

// Read image from disk
export const readImage = async (filePath) => {
  const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
  return await fs.promises.readFile(safePath);
};

// Clean up temporary files
export const cleanupTempFiles = async () => {
  const files = await fs.promises.readdir(tmpDir);
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  for (const file of files) {
    const filePath = path.join(tmpDir, file);
    const stats = await fs.promises.stat(filePath);
    
    if (stats.mtimeMs < oneHourAgo) {
      await fs.promises.unlink(filePath);
    }
  }
};
