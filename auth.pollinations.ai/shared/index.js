/**
 * Shared authentication package for Pollinations services
 * Loads environment variables and exports utilities
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from the shared .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Re-export all utilities
export * from './auth-utils.js';
export * from './config.js';
