#!/usr/bin/env node
// import-projects.mjs
// Simple import script - fetches projects from AI 1 without LLM enrichment
// Outputs clean JS files to src/config/projects/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(SCRIPT_DIR, "..", "src", "config", "projects");

// Map AI 1 files to AI 2 category names
const UPSTREAM_SOURCES = [
  { category: "Creative", filename: "creative", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/creative.js" },
  { category: "Chat", filename: "chat", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/chat.js" },
  { category: "Games", filename: "games", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/games.js" },
  { category: "Dev Tools", filename: "devTools", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/hackAndBuild.js" },
  { category: "Learn", filename: "learn", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/learn.js" },
  { category: "Social Bots", filename: "socialBots", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/socialBots.js" },
  { category: "Vibes", filename: "vibes", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/vibeCoding.js" },
];

const now = () => new Date().toISOString().replace("T", " ").replace("Z", "");
const log = (...args) => console.log(`[${now()}]`, ...args);

async function httpGet(url) {
  const res = await fetch(url, { headers: { "User-Agent": "pollinations-importer/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function extractExportedArray(jsText) {
  const m = jsText.match(/export\s+const\s+\w+\s*=\s*\[/);
  if (!m) throw new Error("No exported array found");
  const start = jsText.indexOf('[', m.index);
  let i = start;
  let depth = 0;
  let inStr = false;
  let strCh = '';
  let prev = '';
  for (; i < jsText.length; i++) {
    const ch = jsText[i];
    if (inStr) {
      if (ch === strCh && prev !== '\\') { inStr = false; strCh = ''; }
      prev = ch; continue;
    }
    if (ch === '"' || ch === '\'') { inStr = true; strCh = ch; prev = ch; continue; }
    if (ch === '[') { depth++; }
    else if (ch === ']') { depth--; if (depth === 0) { i++; break; } }
    prev = ch;
  }
  const arrLiteral = jsText.slice(start, i);
  const fn = new Function(`"use strict"; return (${arrLiteral});`);
  return fn();
}

async function main() {
  log("📥 Importing projects from Pollinations AI 1...");
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    log(`Created output directory: ${OUTPUT_DIR}`);
  }

  let totalProjects = 0;

  for (const src of UPSTREAM_SOURCES) {
    log(`\nFetching ${src.category}...`);
    
    try {
      const jsText = await httpGet(src.url);
      const arr = extractExportedArray(jsText);
      
      // Write as JS file
      const outputPath = path.join(OUTPUT_DIR, `${src.filename}.js`);
      const fileContent = `// ${src.category} projects imported from Pollinations AI 1
// Last updated: ${new Date().toISOString()}

export const ${src.filename}Projects = ${JSON.stringify(arr, null, 2)};
`;
      
      fs.writeFileSync(outputPath, fileContent, 'utf-8');
      log(`✅ Wrote ${arr.length} projects to ${src.filename}.js`);
      totalProjects += arr.length;
      
    } catch (e) {
      log(`❌ Failed to load ${src.category}:`, String(e?.message || e));
    }
  }
  
  // Create index file
  const indexContent = `// Project imports for Pollinations AI 2
// Auto-generated - do not edit manually

export { creativeProjects } from './creative.js';
export { chatProjects } from './chat.js';
export { gamesProjects } from './games.js';
export { devToolsProjects } from './devTools.js';
export { learnProjects } from './learn.js';
export { socialBotsProjects } from './socialBots.js';
export { vibesProjects } from './vibes.js';

// All projects combined
export const allProjects = [
  ...creativeProjects,
  ...chatProjects,
  ...gamesProjects,
  ...devToolsProjects,
  ...learnProjects,
  ...socialBotsProjects,
  ...vibesProjects,
];
`;
  
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.js'), indexContent, 'utf-8');
  log(`\n✅ Created index.js`);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Import complete!`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📊 Total projects imported: ${totalProjects}`);
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
