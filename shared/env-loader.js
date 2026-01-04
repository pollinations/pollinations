/**
 * Shared environment loader for Pollinations services
 * Automatically loads both shared and local .env files with proper precedence
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Use different variable names to avoid conflicts with global __filename/__dirname
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

/**
 * Load environment variables from both shared and local .env files
 * Shared .env is loaded first, then local .env (local takes precedence)
 * @param {string} localEnvPath - Optional path to local .env file (defaults to process.cwd()/.env)
 */
export function loadEnvironments(localEnvPath = null) {
    // Load shared .env file first
    const sharedEnvPath = path.resolve(currentDirPath, ".env");
    dotenv.config({ path: sharedEnvPath });

    // Load local .env file (takes precedence over shared)
    if (localEnvPath) {
        dotenv.config({ path: localEnvPath });
    } else {
        dotenv.config(); // Use default .env file in current working directory
    }
}

// Auto-load environments when this module is imported
loadEnvironments();
