import { test } from "node:test";
import assert from "node:assert/strict";
import { buildComicImageUrl } from "./image.ts";

test("buildComicImageUrl with no image uses the original cat reference and enhance=true", () => {
  const url = buildComicImageUrl("why are boxes magic?", "Naps. Next question.");
  assert.ok(url.startsWith("https://gen.pollinations.ai/image/"));
  assert.match(url, /enhance=true/);
  assert.match(url, /model=nanobanana/);
  assert.match(url, /image=https%3A%2F%2Fraw\.githubusercontent\.com.*original-catgpt\.png/);
  assert.match(url, /width=1024/);
  assert.match(url, /height=1024/);
});

test("buildComicImageUrl with uploaded image disables enhance and stacks selfie reference", () => {
  const uploaded = "https://example.com/avatar.png";
  const url = buildComicImageUrl("q", "r", uploaded);
  assert.match(url, /enhance=false/);
  // Both the uploaded URL and the SELFIE_CATGPT reference must be present.
  assert.match(url, /example\.com%2Favatar\.png/);
  assert.match(url, /media\.pollinations\.ai%2Fa84b58d293d69f35/);
});

test("buildComicImageUrl forwards apiKey when provided", () => {
  const url = buildComicImageUrl("q", "r", null, { apiKey: "sk_test_abc" });
  assert.match(url, /[?&]key=sk_test_abc/);
});

test("buildComicImageUrl omits key when apiKey is undefined", () => {
  const url = buildComicImageUrl("q", "r", null);
  assert.doesNotMatch(url, /[?&]key=/);
});

test("buildComicImageUrl honors custom model", () => {
  const url = buildComicImageUrl("q", "r", null, { imageModel: "gptimage" });
  assert.match(url, /model=gptimage/);
  assert.doesNotMatch(url, /model=nanobanana/);
});

test("buildComicImageUrl honors custom dimensions", () => {
  const url = buildComicImageUrl("q", "r", null, { width: 512, height: 768 });
  assert.match(url, /width=512/);
  assert.match(url, /height=768/);
});

test("buildComicImageUrl URL-encodes the question and reply inside the prompt", () => {
  // Ampersands and spaces in the prompt must not break the query string.
  const url = buildComicImageUrl("a&b", "c d", null);
  const promptPart = url.split("/image/")[1].split("?")[0];
  assert.ok(promptPart.includes("a%26b"));
  assert.ok(promptPart.includes("c%20d"));
  // ...and the rest of the URL still parses cleanly.
  assert.doesNotThrow(() => new URL(url));
});

test("buildComicImageUrl is deterministic for identical inputs", () => {
  const a = buildComicImageUrl("q", "r");
  const b = buildComicImageUrl("q", "r");
  assert.equal(a, b);
});
