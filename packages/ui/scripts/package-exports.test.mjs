import assert from "node:assert/strict";
import { test } from "node:test";
import { Chip, Surface } from "@pollinations/ui";
import { AuthInfoCard } from "@pollinations/ui/auth";
import { Markdown } from "@pollinations/ui/markdown";
import { PaidChip } from "@pollinations/ui/wallet";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";

test("built subpaths reuse the root components", async () => {
    const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let renderer;
    try {
        await act(async () => {
            renderer = create(
                createElement(
                    AuthInfoCard,
                    null,
                    createElement(PaidChip, null, "Paid"),
                ),
            );
        });
        assert.equal(renderer.root.findByType(Surface).type, Surface);
        assert.equal(renderer.root.findByType(Chip).type, Chip);
    } finally {
        await act(async () => renderer?.unmount());
        globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
});

test("the built Markdown entry renders with its ESM dependencies", () => {
    const html = renderToStaticMarkup(
        createElement(Markdown, null, "**Hello** [docs](https://example.test)"),
    );
    assert.match(html, /<strong[^>]*>Hello<\/strong>/);
    assert.match(html, /href="https:\/\/example\.test"/);
});
