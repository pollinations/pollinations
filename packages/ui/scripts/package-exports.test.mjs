import assert from "node:assert/strict";
import { test } from "node:test";
import { Chip, Dialog } from "@pollinations/ui";
import { AuthModal } from "@pollinations/ui/auth";
import { Markdown } from "@pollinations/ui/markdown";
import { PaidChip } from "@pollinations/ui/wallet";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("built subpaths reuse the root components", () => {
    assert.equal(AuthModal({ children: null }).type, Dialog);
    assert.equal(PaidChip({ children: "Paid" }).type, Chip);
});

test("the built Markdown entry renders with its ESM dependencies", () => {
    const html = renderToStaticMarkup(
        createElement(Markdown, null, "**Hello** [docs](https://example.test)"),
    );
    assert.match(html, /<strong[^>]*>Hello<\/strong>/);
    assert.match(html, /href="https:\/\/example\.test"/);
});
