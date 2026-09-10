import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCOPES = new Set(["daily", "weekly"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE_LENGTH = 300;

function isDate(value) {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function imageUrl(post) {
  if (Array.isArray(post?.images)) return post.images[0]?.url;
  if (post?.images && typeof post.images === "object") return post.images.url;
  return post?.image?.url;
}

export function validatePost(post, { scope, date }) {
  if (!SCOPES.has(scope)) throw new Error("scope must be daily or weekly");
  if (!isDate(date)) throw new Error("date must be a real YYYY-MM-DD date");
  if (post?.platform !== "reddit") throw new Error("reddit.json platform must be reddit");
  if (post?.scope !== scope || post?.date !== date) {
    throw new Error("reddit.json scope or date does not match requested period");
  }
  if (typeof post.title !== "string" || !post.title.trim() || post.title.trim().length > MAX_TITLE_LENGTH) {
    throw new Error(`reddit.json requires a title of 1-${MAX_TITLE_LENGTH} characters`);
  }
  let url;
  try {
    url = new URL(imageUrl(post));
  } catch {
    throw new Error("reddit.json requires an HTTPS image URL");
  }
  if (url.protocol !== "https:") throw new Error("reddit.json requires an HTTPS image URL");
  return { title: post.title.trim(), imageUrl: url.href, scope, date };
}

function messageFromLog(record) {
  if (!record || typeof record !== "object") return undefined;
  return typeof record.message === "string" ? record.message : undefined;
}

export function findReceipt(logLines, expected) {
  for (const line of logLines) {
    let envelope;
    try {
      envelope = typeof line === "string" ? JSON.parse(line) : line;
    } catch {
      continue;
    }
    const message = messageFromLog(envelope);
    if (!message) continue;
    try {
      const record = JSON.parse(message);
      if (record.event === "reddit_news_posted" && record.scope === expected.scope && record.date === expected.date && typeof record.postId === "string" && record.postId) return record.postId;
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function loadAndValidate(path, expected) {
  return validatePost(JSON.parse(await readFile(path, "utf8")), expected);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [path, scope, date] = process.argv.slice(2);
  if (!(path && scope && date)) throw new Error("usage: node runner.mjs <reddit.json> <daily|weekly> <YYYY-MM-DD>");
  console.log(JSON.stringify(await loadAndValidate(fileURLToPath(pathToFileURL(path)), { scope, date })));
}
