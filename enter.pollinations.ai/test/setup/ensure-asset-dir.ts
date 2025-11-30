import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";

// Get the directory of this setup file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Go up to project root
const projectRoot = resolve(__dirname, "../..");
const assetsDir = resolve(projectRoot, "./dist/client");

// Create directory if it doesn't exist
export function setup() {
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
        console.log(`Created assets directory: ${assetsDir}`);
    }
}
