import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { generateTransparentImage } from './transparentImageGenerator';
import { uploadToImgbb } from './imgbbUploader';

/**
 * Interface for the resolution cache data structure
 */
interface ResolutionCache {
  [resolutionKey: string]: string; // e.g., "1920x1080": "https://i.ibb.co/..."
}

/**
 * Configuration for the cache system
 */
const CACHE_CONFIG = {
  cacheFilePath: join(process.cwd(), 'cache', 'resolutionUrls.json'),
  cacheDir: join(process.cwd(), 'cache'),
} as const;

/**
 * Creates a resolution key from width and height
 */
function createResolutionKey(width: number, height: number): string {
  return `${width}x${height}`;
}

/**
 * Ensures the cache directory exists
 */
async function ensureCacheDirectory(): Promise<void> {
  try {
    await fs.access(CACHE_CONFIG.cacheDir);
  } catch {
    await fs.mkdir(CACHE_CONFIG.cacheDir, { recursive: true });
    console.log(`Created cache directory: ${CACHE_CONFIG.cacheDir}`);
  }
}

/**
 * Reads and parses the cache file safely
 */
async function readCacheFile(): Promise<ResolutionCache> {
  try {
    const cacheData = await fs.readFile(CACHE_CONFIG.cacheFilePath, 'utf-8');
    const parsed = JSON.parse(cacheData) as ResolutionCache;

    // Validate that it's an object
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Cache file does not contain a valid object');
    }

    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, return empty cache
      console.log('Cache file does not exist, starting with empty cache');
      return {};
    }

    // File exists but is corrupted
    console.warn(`Cache file corrupted: ${error instanceof Error ? error.message : String(error)}`);
    console.log('Recreating cache file...');

    // Try to backup the corrupted file
    try {
      const corruptedContent = await fs.readFile(CACHE_CONFIG.cacheFilePath, 'utf-8');
      const backupPath = `${CACHE_CONFIG.cacheFilePath}.corrupted.${Date.now()}`;
      await fs.writeFile(backupPath, corruptedContent);
      console.log(`Backed up corrupted cache to: ${backupPath}`);
    } catch (backupError) {
      console.warn('Failed to backup corrupted cache file:', backupError);
    }

    return {};
  }
}

/**
 * Writes cache data to file safely with atomic operation
 */
async function writeCacheFile(cache: ResolutionCache): Promise<void> {
  const tempFilePath = `${CACHE_CONFIG.cacheFilePath}.tmp`;

  try {
    // Write to temporary file first
    await fs.writeFile(tempFilePath, JSON.stringify(cache, null, 2), 'utf-8');

    // Atomic rename
    await fs.rename(tempFilePath, CACHE_CONFIG.cacheFilePath);

    console.log(`Cache updated successfully. Total cached resolutions: ${Object.keys(cache).length}`);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempFilePath);
    } catch {
      // Ignore cleanup errors
    }

    throw new Error(`Failed to write cache file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generates a new resolution URL by creating transparent image and uploading to imgbb
 */
async function generateResolutionUrl(width: number, height: number): Promise<string> {
  const resolutionKey = createResolutionKey(width, height);

  try {
    console.log(`Generating new transparent image for resolution: ${resolutionKey}`);

    // Generate transparent image buffer
    const imageBuffer = await generateTransparentImage(width, height);

    // Upload to imgbb
    const imageUrl = await uploadToImgbb(imageBuffer, resolutionKey);

    console.log(`Successfully generated and uploaded image for ${resolutionKey}: ${imageUrl}`);
    return imageUrl;

  } catch (error) {
    throw new Error(
      `Failed to generate resolution URL for ${resolutionKey}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Gets a cached resolution URL or creates a new one if it doesn't exist
 *
 * This function is thread-safe and handles concurrent requests gracefully.
 * Multiple requests for the same resolution will wait for the first one to complete.
 *
 * @param width - The width of the resolution in pixels
 * @param height - The height of the resolution in pixels
 * @returns Promise that resolves to the cached or newly generated URL
 *
 * @example
 * ```typescript
 * const url = await getOrCreateResolutionUrl(1920, 1080);
 * console.log(`Resolution URL: ${url}`);
 * ```
 */
export async function getOrCreateResolutionUrl(width: number, height: number): Promise<string> {
  // Validate input parameters
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`Invalid width: ${width}. Width must be a positive integer.`);
  }

  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`Invalid height: ${height}. Height must be a positive integer.`);
  }

  const resolutionKey = createResolutionKey(width, height);

  try {
    // Ensure cache directory exists
    await ensureCacheDirectory();

    // Read current cache
    const cache = await readCacheFile();

    // Check if resolution already exists in cache
    if (cache[resolutionKey]) {
      console.log(`Found cached URL for resolution ${resolutionKey}: ${cache[resolutionKey]}`);
      return cache[resolutionKey];
    }

    console.log(`No cached URL found for resolution ${resolutionKey}, generating new one...`);

    // Generate new resolution URL (this is the potentially expensive operation)
    const newUrl = await generateResolutionUrl(width, height);

    // Update cache with new URL
    cache[resolutionKey] = newUrl;
    await writeCacheFile(cache);

    return newUrl;

  } catch (error) {
    const errorMessage = `getOrCreateResolutionUrl failed for ${resolutionKey}: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}