import assert from "node:assert/strict";
import {
    demoBank,
    drawFrame,
    readBank,
    readPatch,
    textureIndex,
} from "./patch.js";

const bank = readBank({ ...demoBank, apiKey: "discard-me" });
assert.equal(bank.length, 3);
const prompt = "A reusable botanical prompt. ".repeat(25);
assert.equal(
    readBank({ images: [{ ...demoBank.images[0], caption: prompt }] })[0]
        .caption,
    prompt,
);
assert.deepEqual(Object.keys(bank[0]), ["url", "caption"]);
for (const invalid of [[], Array(17).fill(demoBank.images[0])])
    assert.throws(() => readBank({ images: invalid }));
for (const url of [
    "javascript:alert(1)",
    "blob:https://example.com/1",
    "data:text/html,hello",
    "https://user:secret@example.com/a.png",
    "https://example.com/a.png?token=secret",
])
    assert.throws(() => readBank({ images: [{ url }] }));
assert.deepEqual(
    readPatch({
        rotation: Infinity,
        repetition: 99,
        blend: -1,
        speed: -0.5,
        key: "discard-me",
    }),
    { rotation: 15, repetition: 10, blend: 0, speed: -0.5 },
);
assert.equal(textureIndex(-1, 3), 2);
assert.equal(textureIndex(4, 3), 1);

// The drawing routine receives images and values only: no fetch or generation.
const calls = [];
const ctx = Object.fromEntries(
    [
        "fillRect",
        "save",
        "translate",
        "rotate",
        "scale",
        "restore",
        "drawImage",
    ].map((method) => [method, (...args) => calls.push([method, ...args])]),
);
ctx.canvas = { width: 800, height: 450 };
drawFrame(ctx, ["first", "second"], readPatch(), 0, 0);
assert.equal(calls.filter(([method]) => method === "drawImage").length, 72);
assert.deepEqual(calls.find(([method]) => method === "drawImage").slice(0, 2), [
    "drawImage",
    "first",
]);
assert.equal(
    calls.filter(([method]) => method === "save").length,
    calls.filter(([method]) => method === "restore").length,
);
console.log(
    "Texture instrument: bank validation, patch bounds, selection, and frame composition passed.",
);
