import { test } from "node:test";
import assert from "node:assert/strict";
import { CAT_SYSTEM, EXAMPLE_PROMPTS, createImagePrompt } from "./prompt.ts";

test("CAT_SYSTEM contains the load-bearing constraints", () => {
  assert.match(CAT_SYSTEM, /aloof/i);
  assert.match(CAT_SYSTEM, /sarcastic/i);
  assert.match(CAT_SYSTEM, /2-8 words/i);
  assert.match(CAT_SYSTEM, /Never break character/i);
  assert.match(CAT_SYSTEM, /Respond with ONLY the cat's reply/i);
});

test("CAT_SYSTEM has the canonical example pairs", () => {
  // Hard-coded examples are the difference between "cat-flavored answer" and
  // "actual CatGPT voice". If any of these go missing the prompt has drifted.
  assert.match(CAT_SYSTEM, /Naps\. Next question\./);
  assert.match(CAT_SYSTEM, /Have you tried knocking it off the table\?/);
  assert.match(CAT_SYSTEM, /Humans had jobs\?/);
});

test("EXAMPLE_PROMPTS are non-empty short questions", () => {
  assert.ok(EXAMPLE_PROMPTS.length >= 3);
  for (const p of EXAMPLE_PROMPTS) {
    assert.equal(typeof p, "string");
    assert.ok(p.length > 0 && p.length < 60);
  }
});

test("createImagePrompt embeds the question and reply verbatim", () => {
  const prompt = createImagePrompt("why are boxes magic?", "Naps. Next question.");
  assert.match(prompt, /why are boxes magic\?/);
  assert.match(prompt, /Naps\. Next question\./);
  assert.match(prompt, /Black and white comic style/);
});

test("createImagePrompt swaps human description based on uploaded image", () => {
  const noImg = createImagePrompt("q", "r", false);
  const withImg = createImagePrompt("q", "r", true);
  assert.match(noImg, /Human with bob hair\./);
  assert.doesNotMatch(noImg, /Replace the human/);
  assert.match(withImg, /Replace the human on the left/);
  assert.doesNotMatch(withImg, /bob hair/);
});

test("createImagePrompt is deterministic for identical inputs", () => {
  const a = createImagePrompt("q", "r", false);
  const b = createImagePrompt("q", "r", false);
  assert.equal(a, b);
});
