#!/usr/bin/env node

/**
 * Find potentially unused exports in the enter.pollinations.ai codebase
 * Usage: node scripts/find-dead-code.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get all TypeScript files
function getAllTsFiles(dir, files = []) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // Skip node_modules and test directories
            if (
                !item.includes("node_modules") &&
                !item.includes("__tests__") &&
                !item.includes(".git")
            ) {
                getAllTsFiles(fullPath, files);
            }
        } else if (item.endsWith(".ts") || item.endsWith(".tsx")) {
            files.push(fullPath);
        }
    }

    return files;
}

// Extract exports from a file
function extractExports(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const exports = [];

    // Match: export function name
    const funcMatches = content.matchAll(
        /export\s+(async\s+)?function\s+(\w+)/g,
    );
    for (const match of funcMatches) {
        exports.push({ name: match[2], type: "function", file: filePath });
    }

    // Match: export const name = () => or export const name = async () =>
    const constMatches = content.matchAll(
        /export\s+const\s+(\w+)\s*=\s*(async\s+)?\(/g,
    );
    for (const match of constMatches) {
        exports.push({
            name: match[1],
            type: "const-function",
            file: filePath,
        });
    }

    // Match: export class Name
    const classMatches = content.matchAll(/export\s+class\s+(\w+)/g);
    for (const match of classMatches) {
        exports.push({ name: match[1], type: "class", file: filePath });
    }

    // Match: export type Name and export interface Name
    const typeMatches = content.matchAll(/export\s+(type|interface)\s+(\w+)/g);
    for (const match of typeMatches) {
        exports.push({ name: match[2], type: match[1], file: filePath });
    }

    return exports;
}

// Check if an export is used anywhere
function isExportUsed(exportName, allFiles, definingFile) {
    for (const file of allFiles) {
        if (file === definingFile) continue; // Skip the file where it's defined

        const content = fs.readFileSync(file, "utf8");

        // Check for imports
        if (content.includes(`import`) && content.includes(exportName)) {
            // More precise check for import statements
            const importRegex = new RegExp(
                `import.*[{,\\s]${exportName}[},\\s].*from`,
                "g",
            );
            if (importRegex.test(content)) return true;
        }

        // Check for dynamic imports
        if (content.includes(`import(`) && content.includes(exportName)) {
            return true;
        }

        // For default exports from the defining file
        const relativePath = path
            .relative(path.dirname(file), definingFile)
            .replace(/\\/g, "/")
            .replace(/\.tsx?$/, "");
        if (
            content.includes(`from "${relativePath}"`) ||
            content.includes(`from './${relativePath}'`) ||
            content.includes(`from '${relativePath}'`)
        ) {
            // Check if this import uses our export
            const afterImport = content.split(`from`).slice(1).join("from");
            if (afterImport.includes(exportName)) return true;
        }
    }

    return false;
}

// Main execution
console.log("🔍 Analyzing enter.pollinations.ai for unused exports...\n");

const srcDir = path.join(__dirname, "..", "src");
const allFiles = getAllTsFiles(srcDir);

console.log(`📁 Found ${allFiles.length} TypeScript files\n`);

// Collect all exports
const allExports = [];
for (const file of allFiles) {
    const exports = extractExports(file);
    allExports.push(...exports);
}

console.log(`📦 Found ${allExports.length} total exports\n`);

// Check each export for usage
const unusedExports = [];
for (const exp of allExports) {
    // Skip some common entry points and special files
    if (
        exp.file.includes("index.ts") ||
        exp.file.includes("routes.ts") ||
        exp.file.includes(".test.") ||
        exp.file.includes(".spec.")
    ) {
        continue;
    }

    // Skip React components (usually exported for use)
    if (exp.type === "const-function" && /^[A-Z]/.test(exp.name)) {
        continue;
    }

    if (!isExportUsed(exp.name, allFiles, exp.file)) {
        unusedExports.push(exp);
    }
}

// Group by file for better readability
const byFile = {};
for (const exp of unusedExports) {
    const relPath = path.relative(srcDir, exp.file);
    if (!byFile[relPath]) {
        byFile[relPath] = [];
    }
    byFile[relPath].push(exp);
}

// Display results
if (Object.keys(byFile).length === 0) {
    console.log("✅ No obviously unused exports found!\n");
} else {
    console.log("⚠️  Potentially unused exports:\n");
    console.log("=".repeat(60) + "\n");

    for (const [file, exports] of Object.entries(byFile)) {
        console.log(`📄 ${file}`);
        for (const exp of exports) {
            console.log(`   ❌ ${exp.type}: ${exp.name}`);
        }
        console.log("");
    }

    console.log("=".repeat(60));
    console.log(
        `\n📊 Total: ${unusedExports.length} potentially unused exports in ${Object.keys(byFile).length} files\n`,
    );
    console.log(
        "⚠️  Note: Some may be used externally or dynamically. Verify before removing!\n",
    );
}
