import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { findReceipt, validatePost } from "../runner.mjs";

const exec = promisify(execFile);
const expected = { scope: "daily", date: "2026-09-08" };
const validPost = {
  platform: "reddit",
  ...expected,
  title: "A shipped update",
  images: [{ url: "https://example.com/image.png" }],
};

test("validates canonical Reddit artifacts with array or object images", () => {
  assert.deepEqual(validatePost(validPost, expected), { title: "A shipped update", imageUrl: "https://example.com/image.png", ...expected });
  assert.equal(validatePost({ ...validPost, images: { url: "https://example.com/object.png" } }, expected).imageUrl, "https://example.com/object.png");
});

test("rejects invalid scope, real date, platform, title, and image", () => {
  for (const invalid of [
    [{ ...validPost, title: "" }, expected],
    [{ ...validPost, title: "x".repeat(301) }, expected],
    [{ ...validPost, platform: "twitter" }, expected],
    [{ ...validPost, images: [{ url: "http://example.com/a.png" }] }, expected],
    [validPost, { scope: "daily", date: "2026-02-29" }],
    [validPost, { scope: "weekly", date: expected.date }],
  ]) assert.throws(() => validatePost(...invalid));
});

test("extracts only correlated receipts from pinned CLI JSON envelopes", () => {
  const lines = [
    JSON.stringify({ message: JSON.stringify({ event: "reddit_news_posted", scope: "weekly", date: expected.date, postId: "t3_wrong" }) }),
    JSON.stringify({ message: JSON.stringify({ event: "reddit_news_posted", ...expected, postId: "t3_good" }) }),
  ];
  assert.equal(findReceipt(lines, expected), "t3_good");
  assert.equal(findReceipt([JSON.stringify({ message: JSON.stringify({ event: "reddit_news_pending", ...expected }) })], expected), undefined);
});

test("runner subprocess emits JSON payload from a canonical artifact", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reddit-runner-"));
  const artifact = join(dir, "reddit.json");
  await writeFile(artifact, JSON.stringify(validPost));
  const { stdout } = await exec(process.execPath, ["../runner.mjs", artifact, expected.scope, expected.date], { cwd: import.meta.dirname });
  assert.deepEqual(JSON.parse(stdout), { title: validPost.title, imageUrl: validPost.images[0].url, ...expected });
});

test("workflow remains manual and fail-closed before publishing", async () => {
  const workflow = await (await import("node:fs/promises")).readFile("../../../.github/workflows/reddit-news-devvit.yml", "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+schedule:/m);
  assert.match(workflow, /ENABLE_REDDIT_DEVVIT_PUBLISH == 'true'/);
  assert.match(workflow, /test -n "\$DEVVIT_AUTH_TOKEN"/);
  assert.match(workflow, /group: reddit-news-devvit-app/);
  assert.match(workflow, /TARGET_DATE: \$\{\{ github\.event\.inputs\.target_date \}\}/);
  assert.doesNotMatch(workflow, /news\/\$\{\{ github\.event\.inputs\.target_date \}\}/);
});
