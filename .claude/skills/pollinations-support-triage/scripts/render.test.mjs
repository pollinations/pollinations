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
    input.footerDelivery = "inline";
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
    assert.ok(email.html.includes(palette.brandDark));
    assert.ok(email.html.includes('href="https://pollinations.ai"'));
    assert.equal((email.html.match(/<img /g) || []).length, 1);
    assert.ok(!email.html.includes(">pollinations.ai</a>"));
    assert.ok(email.text.trimEnd().endsWith("https://pollinations.ai"));
    assert.ok(preview.includes("srcdoc="));
});

test("structured formatting escapes content and preserves list and table meaning in plain text", () => {
    const input = example();
    input.message.blocks = [
        {
            type: "list",
            ordered: true,
            items: ["Open settings", "Copy <key-id>"],
        },
        {
            type: "table",
            headers: ["Item", "Result"],
            rows: [["<script>", "Ready & checked"]],
        },
        {
            type: "callout",
            text: "Keep the key private.\nDo not share <secrets>.",
        },
    ];
    const { email } = render(input);
    assert.ok(email.html.includes("<ol "));
    assert.ok(email.html.includes("<thead>"));
    assert.ok(email.html.includes("&lt;script&gt;"));
    assert.ok(!email.html.includes("<script>"));
    assert.ok(email.text.includes("1. Open settings\n2. Copy <key-id>"));
    assert.ok(email.text.includes("Item | Result\n<script> | Ready & checked"));
    assert.ok(
        email.text.includes("Keep the key private.\nDo not share <secrets>."),
    );
    input.message.blocks[1].rows[0].pop();
    assert.throws(() => render(input), /row must match/);
    input.message.blocks = [{ type: "list", items: [] }];
    assert.throws(() => render(input), /list items/);
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

test("Workspace delivery excludes branding from both submitted bodies but previews the footer", () => {
    const input = example();
    input.footerDelivery = "workspace";
    const { email, preview } = render(input);
    assert.ok(!email.html.includes("<img"));
    assert.ok(!email.html.includes('href="https://pollinations.ai"'));
    assert.ok(!email.text.includes("\nhttps://pollinations.ai"));
    assert.ok(preview.includes("lockup-horizontal-black.png"));
    assert.ok(preview.includes("Google Workspace adds"));
    assert.ok(email.html.includes("--models zimage"));
    input.footerDelivery = "unknown";
    assert.throws(() => render(input), /footerDelivery/);
    delete input.footerDelivery;
    assert.throws(() => render(input), /footerDelivery/);
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
