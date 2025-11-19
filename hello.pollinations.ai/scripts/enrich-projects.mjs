#!/usr/bin/env node
// enrich-projects.mjs
// Incremental enrichment script for Pollinations AI 2
// Fetches projects from AI 1, enriches new ones with LLM tagging
// Node 18+ (uses global fetch). No external dependencies.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(SCRIPT_DIR, "..", "data", "projects");
const CATEGORIES_DIR = path.join(DATA_DIR, "categories");

// ===== CLI flags =====
const argv = new Set(process.argv.slice(2));
const QUIET = argv.has("--quiet");
const DRY_RUN = argv.has("--dry-run");
const SAMPLE = argv.has("--sample"); // Test with only 5 projects

// ===== System Prompt =====
const SYSTEM_PROMPT = fs.readFileSync(path.join(SCRIPT_DIR, 'tagging_prompt.txt'), 'utf-8');

// ===== Helpers =====
const CANON_CATS = [
  "Creative",
  "Chat",
  "Games",
  "Dev Tools",
  "Learn",
  "Social Bots",
  "Vibes",
];

const now = () => new Date().toISOString().replace("T", " ").replace("Z", "");
const log = (...args) => { if (!QUIET) console.log(`[${now()}]`, ...args); };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function httpGet(url) {
  const res = await fetch(url, { headers: { "User-Agent": "pollinations-enricher/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function removeEmojis(text) {
  return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
}

function generateProjectId(name, url) {
  const input = `${name || ''}-${url || ''}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const positiveHash = Math.abs(hash);
  return `pln_${positiveHash.toString(36)}`;
}

function deriveAuthorFromLinks(url, repo) {
  const ghRe = /https?:\/\/github\.com\/([^/\s]+)\//i;
  const src = (typeof repo === 'string' && repo) || (typeof url === 'string' && url) || '';
  const m = src.match(ghRe);
  if (m?.[1]) {
    const author = m[1];
    return { author, authorUrl: `https://github.com/${author}` };
  }
  return { author: undefined, authorUrl: undefined };
}

// ===== Upstream JS arrays loader =====
// Map AI 1 category files to AI 2 category names
const UPSTREAM_SOURCES = [
  { category: "Creative", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/creative.js" },
  { category: "Chat", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/chat.js" },
  { category: "Games", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/games.js" },
  { category: "Dev Tools", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/hackAndBuild.js" },
  { category: "Learn", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/learn.js" },
  { category: "Social Bots", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/socialBots.js" },
  { category: "Vibes", url: "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/pollinations.ai/src/config/projects/vibeCoding.js" },
  // Note: Hacktoberfest projects are temporarily excluded - can be manually categorized later
];

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

function mapLangToEnumArray(lang) {
  if (!lang || typeof lang !== 'string') return [];
  const lc = lang.toLowerCase();
  if (lc.startsWith('en')) return ['🇺🇸 EN'];
  if (lc.startsWith('zh')) return ['🇨🇳 ZH'];
  if (lc.startsWith('es')) return ['🇪🇸 ES'];
  if (lc.startsWith('id')) return ['🇮🇩 ID'];
  if (lc.startsWith('ru')) return ['🇷🇺 RU'];
  if (lc.startsWith('pt')) return ['🇵🇹 PT'];
  if (lc.startsWith('br')) return ['🇧🇷 BR'];
  return ['🌐 Other/Unknown'];
}

function deriveStatus(url, repo) {
  const isGit = (s) => typeof s === 'string' && /https?:\/\/github\.com\//i.test(s);
  const hasUrl = typeof url === 'string' && url.trim().length > 0;
  const hasRepo = typeof repo === 'string' && repo.trim().length > 0;
  if (hasRepo && hasUrl && !isGit(url)) return 'Both';
  if (hasRepo && (!hasUrl || isGit(url))) return 'Repo Only';
  if (hasUrl) return 'Hosted App';
  return 'Hosted App';
}

async function loadProjectsFromUpstreamJS() {
  const out = [];
  for (const src of UPSTREAM_SOURCES) {
    try {
      log(`Fetching ${src.category} from upstream...`);
      const js = await httpGet(src.url);
      const arr = extractExportedArray(js);
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        
        const name = item.name || item.url || 'Untitled';
        const url = item.url || '';
        const langRaw = item.language || item.lang;
        const language = mapLangToEnumArray(langRaw);
        const status = deriveStatus(item.url, item.repo);
        const derived = deriveAuthorFromLinks(item.url, item.repo);

        const outputItem = {
          ...item,
          name: removeEmojis(name),
          url,
          primary_category: src.category,
          modality: [],
          platform: [],
          audience: [],
          status,
          language,
          pollinations_integration: [],
          author: item.author || derived.author,
          authorUrl: item.authorUrl || derived.authorUrl,
        };

        out.push(outputItem);
      }
      log(`✅ Loaded ${arr.length} projects from ${src.category}`);
    } catch (e) {
      log(`❌ Failed to load ${src.category}:`, String(e?.message || e));
    }
  }
  
  // Deduplicate by URL
  const seen = new Set();
  const unique = [];
  for (const p of out) {
    let key = p.url || p.name;
    try { 
      const u = new URL(p.url); 
      u.hash = ""; 
      u.search = ""; 
      key = u.toString().replace(/\/+$/, "").toLowerCase(); 
    } catch { 
      key = (p.url || p.name || "").trim().toLowerCase().replace(/\/+$/, ""); 
    }
    if (seen.has(key)) continue; 
    seen.add(key); 
    unique.push(p);
  }
  return unique;
}

// ===== Load existing local projects =====
function loadExistingProjects() {
  const existing = new Map(); // id -> project object
  
  if (!fs.existsSync(CATEGORIES_DIR)) {
    log(`Categories directory doesn't exist yet: ${CATEGORIES_DIR}`);
    return existing;
  }
  
  for (const cat of CANON_CATS) {
    const safe = cat.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and").replaceAll("--", "-");
    const filePath = path.join(CATEGORIES_DIR, `${safe}.jsonl`);
    
    if (!fs.existsSync(filePath)) {
      log(`No existing file for ${cat}, skipping`);
      continue;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      try {
        const project = JSON.parse(s);
        if (project.id) {
          existing.set(project.id, project);
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        log(`Failed to parse line in ${safe}.jsonl:`, errMsg);
      }
    }
  }
  
  log(`Loaded ${existing.size} existing projects from local files`);
  return existing;
}

// ===== LLM tagging =====
async function callLLM(prompt) {
  const apiKey = process.env.POLLINATIONS_API_KEY || process.env.VITE_POLLINATIONS_API_KEY;
  if (!apiKey) {
    throw new Error("POLLINATIONS_API_KEY or VITE_POLLINATIONS_API_KEY environment variable is required");
  }

  const url = "https://enter.pollinations.ai/api/generate/openai";
  const body = {
    model: "openai", // Large model
    messages: [
      { role: "user", content: prompt }
    ],
    // Note: temperature parameter removed - default value (1) used for model compatibility
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LLM HTTP ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

function strictJsonParse(txt) {
  try { return JSON.parse(txt); } catch { /* Invalid JSON, try extracting */ }
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* Failed to parse extracted JSON */ } }
  return null;
}

function buildTagPromptFromItem(item) {
  const userBlock = {
    name: item.name,
    url: item.url,
    repo: item.repo,
    description: item.description,
    stars: item.stars,
    submissionDate: item.submissionDate,
    primary_category_from_source: item.primary_category,
    language_raw: item.language,
    author: item.author,
    order: item.order,
    hidden: item.hidden,
  };
  return `${SYSTEM_PROMPT}\n\n---\nItem:\n${JSON.stringify(userBlock, null, 2)}\n\nRespond with ONLY the JSON object.`;
}

// ===== Main =====
async function main() {
  log("🔄 Starting incremental enrichment for Pollinations AI 2...");
  
  // Ensure directories exist
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    log(`Created data directory: ${DATA_DIR}`);
  }
  if (!fs.existsSync(CATEGORIES_DIR)) {
    fs.mkdirSync(CATEGORIES_DIR, { recursive: true });
    log(`Created categories directory: ${CATEGORIES_DIR}`);
  }
  
  // Load existing projects
  const existing = loadExistingProjects();
  
  // Load upstream projects
  log("\n📥 Loading upstream JS project arrays from Pollinations AI 1...");
  const upstreamProjects = await loadProjectsFromUpstreamJS();
  log(`\n✅ Found ${upstreamProjects.length} total projects in upstream`);
  
  // Identify new projects
  const newProjects = [];
  const updatedProjects = [];
  
  for (const proj of upstreamProjects) {
    const id = generateProjectId(proj.name, proj.url);
    proj.id = id;
    
    if (!existing.has(id)) {
      newProjects.push(proj);
    } else {
      // Project exists - keep existing enriched version
      updatedProjects.push(existing.get(id));
    }
  }
  
  log(`\n📊 Analysis:`);
  log(`   • New projects to enrich: ${newProjects.length}`);
  log(`   • Existing enriched projects: ${updatedProjects.length}`);
  log(`   • Total: ${upstreamProjects.length}`);
  
  if (DRY_RUN) {
    console.log("\n" + JSON.stringify({
      dry_run: true,
      total_upstream: upstreamProjects.length,
      existing_count: updatedProjects.length,
      new_count: newProjects.length,
      sample_new: newProjects.slice(0, 5).map(p => ({ name: p.name, url: p.url, category: p.primary_category }))
    }, null, 2));
    return;
  }
  
  if (newProjects.length === 0) {
    log("\n✅ No new projects to process!");
    log("💡 All upstream projects are already enriched in your local database");
    return;
  }
  
  // Limit to 5 projects if --sample flag is used
  const projectsToProcess = SAMPLE ? newProjects.slice(0, 5) : newProjects;
  
  if (SAMPLE && newProjects.length > 5) {
    log(`\n⚠️  SAMPLE MODE: Processing only first 5 of ${newProjects.length} new projects`);
  }
  
  log(`\n🤖 Processing ${projectsToProcess.length} new projects with LLM enrichment...`);
  log("⏱️  This may take a while (1s delay between requests)...\n");
  
  const processedNew = [];
  const errors = [];
  
  for (let i = 0; i < projectsToProcess.length; i++) {
    const proj = projectsToProcess[i];
    const prefix = `[${i + 1}/${projectsToProcess.length}]`;
    log(`${prefix} Processing: ${proj.name} (${proj.primary_category})`);
    
    const prompt = buildTagPromptFromItem(proj);
    
    let attempt = 0, parsed = null, ok = false, lastErr = null;
    while (attempt < 3 && !ok) {
      attempt++;
      try {
        log(`${prefix}  • LLM request attempt ${attempt}`);
        const raw = await callLLM(prompt);
        
        parsed = strictJsonParse(raw);
        if (!parsed || typeof parsed !== "object") throw new Error("Invalid/Non-JSON response");
        
        // Ensure ID is set
        parsed.id = proj.id;
        
        // Preserve fields from upstream
        if (proj.description && !parsed.description) parsed.description = proj.description;
        if (proj.repo && !parsed.repo) parsed.repo = proj.repo;
        if (typeof proj.stars === 'number' && typeof parsed.stars !== 'number') parsed.stars = proj.stars;
        if (typeof proj.order === 'number') parsed.order = proj.order;
        if (typeof proj.hidden === 'boolean') parsed.hidden = proj.hidden;
        if (!parsed.author) {
          const d = deriveAuthorFromLinks(parsed.url || proj.url, parsed.repo || proj.repo);
          if (d.author) { parsed.author = d.author; parsed.authorUrl = d.authorUrl; }
        }
        
        processedNew.push(parsed);
        log(`${prefix}  ✅ Enriched successfully`);
        ok = true;
      } catch (e) {
        lastErr = e;
        log(`${prefix}  ❌ Error attempt ${attempt}: ${String(e.message || e)}`);
        if (attempt < 3) {
          const backoff = 600 * attempt;
          log(`${prefix}    ⏳ Waiting ${backoff}ms before retry...`);
          await sleep(backoff);
        }
      }
    }
    
    if (!ok) {
      errors.push({
        index: i + 1,
        name: proj.name,
        url: proj.url,
        category: proj.primary_category,
        error: String(lastErr?.message || lastErr || "Unknown error")
      });
      log(`${prefix}  ⚠️  Gave up after 3 attempts, skipping`);
    }
    
    // Rate limiting
    await sleep(1000);
  }
  
  log(`\n📝 Writing enriched projects to files...`);
  
  // Combine existing + new projects by category
  const byCategory = new Map();
  
  for (const cat of CANON_CATS) {
    byCategory.set(cat, []);
  }
  
  // Add all existing enriched projects
  for (const proj of updatedProjects) {
    const cat = proj.primary_category;
    if (byCategory.has(cat)) {
      byCategory.get(cat).push(proj);
    }
  }
  
  // Add newly enriched projects
  for (const proj of processedNew) {
    const cat = proj.primary_category;
    if (byCategory.has(cat)) {
      byCategory.get(cat).push(proj);
    }
  }
  
  // Sort each category by submission date (most recent first)
  for (const [, projects] of byCategory.entries()) {
    projects.sort((a, b) => {
      const dateA = a.submissionDate;
      const dateB = b.submissionDate;
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }
  
  // Write to categories folder
  let totalWritten = 0;
  
  for (const [category, projects] of byCategory.entries()) {
    const safe = category.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and").replaceAll("--", "-");
    const filePath = path.join(CATEGORIES_DIR, `${safe}.jsonl`);
    
    const lines = projects.map(p => JSON.stringify(p)).join('\n');
    fs.writeFileSync(filePath, lines + '\n', 'utf-8');
    
    log(`✅ Wrote ${projects.length} projects to ${safe}.jsonl`);
    totalWritten += projects.length;
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Enrichment complete!`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📊 Statistics:`);
  console.log(`   • Existing enriched projects: ${updatedProjects.length}`);
  console.log(`   • Newly enriched projects: ${processedNew.length}`);
  console.log(`   • Failed to process: ${errors.length}`);
  console.log(`   • Total in database: ${totalWritten}`);
  console.log(`   • Output directory: ${CATEGORIES_DIR}`);
  console.log(`${'='.repeat(60)}\n`);
  
  if (errors.length > 0) {
    console.log("⚠️  Errors encountered:");
    console.log(JSON.stringify(errors, null, 2));
  }
}

main().catch(err => {
  console.error(`[${now()}] Fatal error:`, err);
  process.exit(1);
});
