import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { readSourceInfo } from "./source-info";

if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_REF !== "refs/heads/production"
)
    throw new Error(
        "Deploy Flow through Deploy / Applications from production.",
    );

const source = await readSourceInfo();
if (source.dirty) throw new Error("Deploy Flow from a clean checkout.");
const vars = {
    FLOW_REVISION: source.revision,
    FLOW_MAIN_REVISION: source.mainRevision,
    FLOW_DIRTY: "false",
};
execFileSync(
    "wrangler",
    [
        "deploy",
        ...Object.entries(vars).flatMap(([name, value]) => [
            "--var",
            `${name}:${value}`,
        ]),
    ],
    { stdio: "inherit", env: { ...process.env, ...vars } },
);
const { vars: origins } = JSON.parse(
    await readFile(new URL("./wrangler.json", import.meta.url), "utf8"),
);
for (const origin of [origins.FLOW_ENTER_ORIGIN, origins.FLOW_ADMIN_ORIGIN]) {
    const entry = await fetch(`${origin}/flow`, {
        headers: { Accept: "text/html" },
    });
    assert.equal(entry.status, 200);
    assert.match(await entry.text(), /Sign in with Pollinations/);
    for (const path of [
        "/__flow/state",
        "/api/auth/get-session",
        "/auth/session",
    ]) {
        const response = await fetch(`${origin}${path}`, {
            redirect: "manual",
        });
        assert.equal(response.status, 401, `${origin}${path}`);
        await response.body?.cancel();
    }
    console.log(`${origin}: HTTPS and anonymous access checks passed`);
}
