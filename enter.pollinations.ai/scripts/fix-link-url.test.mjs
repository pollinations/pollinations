// index.html's inline clean-up of the ")" chat apps add to gen's fix links,
// run against page URLs as the browser would load them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const html = readFileSync(
    new URL("../frontend/index.html", import.meta.url),
    "utf8",
);
const script = html.match(
    /<script id="fix-link-url">([\s\S]*?)<\/script>/,
)?.[1];
const enter = "https://enter.pollinations.ai";

/** The URL the page is left on after the script runs. */
function open(path) {
    const location = new URL(enter + path);
    let landed = location.href;
    const history = {
        state: null,
        replaceState: (_state, _title, url) => {
            landed = url;
        },
    };
    vm.runInNewContext(script, { location, history, URLSearchParams });
    return landed.replace(enter, "");
}

test("finds the script in index.html", () => {
    assert.ok(script);
});

test("drops the bracket a chat app adds to gen's fix links", () => {
    for (const [link, clean] of [
        [
            "/top-up?ref=agent_low_balance_topup)",
            "/top-up?ref=agent_low_balance_topup",
        ],
        [
            "/top-up?ref=agent_low_balance_topup&redirect=https%3A%2F%2Fapp.example)",
            "/top-up?ref=agent_low_balance_topup&redirect=https%3A%2F%2Fapp.example",
        ],
        [
            "/quests?ref=agent_low_balance_quests))",
            "/quests?ref=agent_low_balance_quests",
        ],
        [
            "/edit-key?id=k1&ref=agent_key_budget)",
            "/edit-key?id=k1&ref=agent_key_budget",
        ],
        [
            "/grant?id=k1&sig=s1&ref=agent_grant)",
            "/grant?id=k1&sig=s1&ref=agent_grant",
        ],
    ]) {
        assert.equal(open(link), clean, link);
    }
});

test("leaves every other URL exactly as sent", () => {
    for (const link of [
        // An OAuth state must come back unchanged, even with a ref.
        "/authorize?ref=text&redirect_url=https%3A%2F%2Fapp.example%2Fcb&state=opaque)",
        "/authorize?redirect_url=https%3A%2F%2Fapp.example%2Fcb&state=opaque)",
        // A fix-link page without gen's ref.
        "/top-up?redirect=https%3A%2F%2Fapp.example)",
        // Brackets that something opened.
        "/top-up?ref=agent_low_balance_topup&redirect=https://en.wikipedia.org/wiki/Foo_(bar)",
    ]) {
        assert.equal(open(link), link, link);
    }
});
