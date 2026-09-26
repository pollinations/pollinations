import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { chromium } from "playwright";

// Run only inside a disposable container: this resets its fixture database.
const origin = "http://localhost:4180";
let ready = false;
for (let attempt = 0; attempt < 120; attempt++) {
    try {
        const response = await fetch(`${origin}/flow`);
        ready = response.ok;
        await response.body?.cancel();
        if (ready) break;
    } catch {
        // The entrypoint is still bundling the real Workers and migrating D1.
    }
    await setTimeout(1000);
}
assert(ready, "Packaged Flow did not start within two minutes");

const before = await fetch(`${origin}/__flow/state`);
if (process.argv[2] === "empty") {
    assert.equal(before.status, 200);
    assert.equal((await before.json()).wallet.total, 0);
} else {
    assert.equal(
        before.status,
        409,
        "A new container must have no prepared review",
    );
    await before.body?.cancel();
}
const prepared = await fetch(`${origin}/__flow/reset`, { method: "POST" });
assert.equal(prepared.status, 200);
// Reset supplies the checked-in inert session fixture, not a minted credential.
const cookie = prepared.headers.get("set-cookie").split(";")[0];
await prepared.body?.cancel();
const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext();
    await context.addCookies([
        {
            name: cookie.slice(0, cookie.indexOf("=")),
            value: cookie.slice(cookie.indexOf("=") + 1),
            url: origin,
            httpOnly: true,
            sameSite: "Lax",
        },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/keys`);
    await page
        .getByRole("button", { name: "Create secret key", exact: true })
        .click();
    await page
        .getByRole("heading", { name: "Create secret key", exact: true })
        .waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert(
        await page.evaluate(() =>
            [...document.fonts].some(
                (font) =>
                    font.status === "loaded" && font.family.includes("Uncut"),
            ),
        ),
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(
        await page
            .getByRole("heading", { name: "Create secret key", exact: true })
            .count(),
        0,
    );
    await page.goto(
        `${origin}/flow?theme=dark&view=map&flow=account&section=catalog`,
    );
    await page.waitForFunction(() =>
        document.getElementById("canvas-root")?.textContent.includes("Models"),
    );
    assert.deepEqual(errors, []);
    await context.close();
} finally {
    await browser.close();
}

const caseId = "dashboard-catalog--model_catalog=error";
const params = new URLSearchParams({
    flow: "account",
    section: "catalog",
    cases: caseId,
    theme: "dark",
    size: "mobile",
});
let captured = false;
for (let attempt = 0; attempt < 120; attempt++) {
    const response = await fetch(`${origin}/__flow/previews?${params}`);
    assert.equal(response.status, 200);
    const result = await response.json();
    if (result.status === "loading") {
        await setTimeout(1000);
        continue;
    }
    assert.equal(result.cases[caseId]?.status, "ready", JSON.stringify(result));
    const image = await fetch(`${origin}${result.cases[caseId].image}`);
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-type"), /image/);
    assert((await image.arrayBuffer()).byteLength > 0);
    captured = true;
    break;
}
assert(captured, "Packaged error capture did not finish within two minutes");
console.log(
    "Built Enter dialog, loaded fonts, Flow Map and real Worker error capture passed.",
);
