#!/usr/bin/env node

/**
 * Script to remove confirmed dead projects from project lists
 *
 * Based on search results, these projects should be removed:
 * - WebGeniusAI
 * - Pollinations Feed
 * - AI 文本转音频 🇨🇳
 * - BlackWave
 * - Snapgen.io
 * - Pollinations AI Video Generator
 * - Pollinations AI Image Generator
 * - Anime AI Generation
 * - Pollinations Gallery
 */

const DEAD_PROJECTS = [
    "WebGeniusAI",
    "Pollinations Feed",
    "AI 文本转音频 🇨🇳",
    "BlackWave",
    "Snapgen.io",
    "Pollinations AI Video Generator",
    "Pollinations AI Image Generator",
    "Anime AI Generation",
    "Pollinations Gallery",
];

console.log("🗑️ Projects recommended for removal:");
DEAD_PROJECTS.forEach((project) => {
    console.log(`  - ${project}`);
});

console.log("\n📝 Manual cleanup required in:");
console.log("  - pollinations.ai/src/config/projects/*.js files");
console.log("  - Remove project entries matching the names above");

export { DEAD_PROJECTS };
