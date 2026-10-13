import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { render } from "./render.mjs";

const example = () =>
    JSON.parse(
        readFileSync(
            new URL("../assets/example.json", import.meta.url),
            "utf8",
        ),
    );

test("renders escaped content, real brand palette and a website signature in both formats", () => {
    const input = example();
    input.sender = '<script>alert("sender")</script>';
    input.message.blocks.push({
        type: "paragraph",
        text: '<img src=x onerror="alert(1)"> & details',
    });
    const { email, preview } = render(input);
    assert.ok(!email.html.includes("<script>"));
    assert.ok(email.html.includes("&lt;img src=x"));
    assert.ok(email.html.includes("--models zimage"));
    const palette = JSON.parse(
        readFileSync(
            new URL(
                "../../../../packages/ui/src/theme-palette.json",
                import.meta.url,
            ),
            "utf8",
        ),
    );
    assert.ok(email.html.includes(palette.bgActive.accent));
    assert.ok(email.html.includes('href="https://pollinations.ai"'));
    assert.ok(email.text.trimEnd().endsWith("https://pollinations.ai"));
    assert.ok(preview.includes("srcdoc="));
});

test("requires documentation for technical replies and rejects executable links", () => {
    const input = example();
    input.message.docs = [];
    assert.throws(() => render(input), /needs docs/);
    input.documentationGap =
        "No public documentation for this operation; explained in the message.";
    assert.doesNotThrow(() => render(input));
    input.message.docs = [{ label: "Bad", url: "javascript:alert(1)" }];
    assert.throws(() => render(input), /HTTPS/);
});

test("requires English review, preserves commands and keeps translation out of outgoing mail", () => {
    const input = example();
    input.message.language = "zh-CN";
    assert.throws(() => render(input), /translation is required/);
    input.english = structuredClone(input.message);
    input.english.language = "en";
    input.english.title = "English review title";
    const { email, english, preview } = render(input);
    assert.ok(!email.html.includes(input.english.title));
    assert.ok(english.html.includes(input.english.title));
    assert.ok(preview.includes("English · Review only"));
    input.english.blocks.find((b) => b.type === "code").text += " --wrong";
    assert.throws(() => render(input), /preserve code/);
});
