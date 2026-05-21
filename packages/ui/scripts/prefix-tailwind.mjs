#!/usr/bin/env node
// Prefixes Tailwind utility classes with `polli:` for v4 prefix(polli) builds.
// Walks src/**/*.{tsx,ts,css}. For each className string in JSX (string
// literals + template literals), each @apply in CSS, and each string literal
// inside a cn(...) call, prepends `polli:` to the head of every variant chain.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..", "src");

// Standalone single-word Tailwind utilities (no '-' or '[' inside).
const SINGLE_OK = new Set([
    "flex","grid","hidden","block","inline","relative","absolute","fixed",
    "sticky","static","contents","table","truncate","italic","underline",
    "overline","uppercase","lowercase","capitalize","antialiased","invisible",
    "visible","isolate","container","group","peer","filter","transition",
    "shadow","border","rounded","outline","ring","cursor","appearance",
    "select","resize","scroll","snap",
]);

// Allowed character set inside a class token.
const TOKEN_RE = /^[A-Za-z0-9_\-:\[\]\(\)\/.%,#'"\\!]+$/;

function shouldPrefix(token) {
    if (!token) return false;
    if (!TOKEN_RE.test(token)) return false;
    if (token.startsWith("polli:")) return false;
    const bare = token.replace(/^!/, "");
    // Split into variant chain + utility — colons OUTSIDE [..]
    const parts = [];
    let depth = 0;
    let buf = "";
    for (const ch of bare) {
        if (ch === "[") depth++;
        else if (ch === "]") depth--;
        if (ch === ":" && depth === 0) {
            parts.push(buf);
            buf = "";
        } else {
            buf += ch;
        }
    }
    parts.push(buf);
    const utility = parts[parts.length - 1];
    if (!utility) return false;
    if (!/^[A-Za-z\[\-]/.test(utility)) return false;
    if (utility.includes("-") || utility.includes("[") || utility.includes("/")) {
        return true;
    }
    // Single-word utility: only prefix if variant chain is present OR it's
    // a known TW keyword.
    if (parts.length > 1) return true;
    return SINGLE_OK.has(utility);
}

function prefixClassString(str) {
    return str.replace(/(\S+)/g, (m) => (shouldPrefix(m) ? `polli:${m}` : m));
}

// A string literal is class-shaped if EITHER:
//   (a) it contains a space AND every non-empty whitespace token is a TW token
//       (or already polli-prefixed), OR
//   (b) it's a single token that contains ':' (variant chain) and shouldPrefix
//       returns true.
function isClassShaped(inner) {
    if (!inner) return false;
    const tokens = inner.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;
    if (tokens.length === 1) {
        // Require a variant chain to count as class-shaped — otherwise too
        // many false positives (module specifiers, route names, etc.).
        if (!tokens[0].includes(":")) return false;
        return shouldPrefix(tokens[0]);
    }
    // Multi-token: every token must be a TW token or already prefixed.
    for (const t of tokens) {
        if (t.startsWith("polli:")) continue;
        if (!shouldPrefix(t)) return false;
    }
    return true;
}

function transformJSXLike(src) {
    let out = src;

    // Skip lines that are import/export statements when handling Pass B.
    // We do this by line-marking import/export statements and not touching
    // strings on those lines.
    const importLines = new Set();
    const lines = out.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*(import|export)\b/.test(lines[i])) {
            importLines.add(i);
        }
    }

    // Pass A: attribute className="..." / class="..." (these are always safe)
    out = out.replace(
        /(\sclassName\s*=\s*)("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g,
        (full, head, q) => {
            const quote = q[0];
            const inner = q.slice(1, -1);
            return `${head}${quote}${prefixClassString(inner)}${quote}`;
        },
    );

    // For Pass B + C, we need to skip strings on import/export lines.
    // Rebuild lines, processing per-line.
    const outLines = out.split("\n");
    for (let i = 0; i < outLines.length; i++) {
        if (importLines.has(i)) continue;
        let line = outLines[i];
        // Pass B: class-shaped string literals
        line = line.replace(
            /("([^"\\\n]|\\.)*"|'([^'\\\n]|\\.)*')/g,
            (full) => {
                const quote = full[0];
                const inner = full.slice(1, -1);
                if (!isClassShaped(inner)) return full;
                return `${quote}${prefixClassString(inner)}${quote}`;
            },
        );
        // Pass C: template literals — only transform if the template's
        // static parts (between ${} placeholders) look class-shaped overall.
        line = line.replace(/`([^`\\]|\\.)*`/g, (full) => {
            const parts = [];
            let p = 1;
            const end = full.length - 1;
            let buf = "";
            while (p < end) {
                if (full[p] === "$" && full[p + 1] === "{") {
                    parts.push({ t: "str", v: buf });
                    buf = "";
                    let depth = 1;
                    let j = p + 2;
                    while (j < end && depth > 0) {
                        if (full[j] === "{") depth++;
                        else if (full[j] === "}") depth--;
                        if (depth === 0) break;
                        j++;
                    }
                    parts.push({ t: "expr", v: full.slice(p, j + 1) });
                    p = j + 1;
                } else {
                    buf += full[p++];
                }
            }
            parts.push({ t: "str", v: buf });
            const merged = parts
                .filter((x) => x.t === "str")
                .map((x) => x.v)
                .join(" ");
            if (!isClassShaped(merged)) return full;
            const rebuilt = parts
                .map((x) => (x.t === "str" ? prefixClassString(x.v) : x.v))
                .join("");
            return `\`${rebuilt}\``;
        });
        outLines[i] = line;
    }
    return outLines.join("\n");
}

function transformCSS(src) {
    return src.replace(/@apply\s+([^;]+);/g, (_full, tokens) => {
        return `@apply ${prefixClassString(tokens.trim())};`;
    });
}

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p, out);
        else if (/\.(tsx|ts|css)$/.test(entry.name)) out.push(p);
    }
    return out;
}

let touched = 0;

for (const file of walk(ROOT)) {
    const src = fs.readFileSync(file, "utf8");
    let next;
    if (file.endsWith(".css")) {
        next = transformCSS(src);
    } else {
        next = transformJSXLike(src);
    }
    if (next !== src) {
        fs.writeFileSync(file, next);
        touched++;
        console.log(`prefixed: ${path.relative(ROOT, file)}`);
    }
}

console.log(`\nDone. Files changed: ${touched}`);
