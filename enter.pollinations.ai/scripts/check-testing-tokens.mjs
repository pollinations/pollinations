#!/usr/bin/env node
// Checks that the API tokens in .testingtokens still authenticate, so a dead
// token is caught before it is mistaken for a broken deploy.
//   npm run check-tokens
import { readFileSync } from "node:fs";

const targets = {
    ENTER_API_TOKEN_REMOTE: "https://gen.pollinations.ai",
    ENTER_API_TOKEN_STAGING: "https://staging.gen.pollinations.ai",
};

const tokens = Object.fromEntries(
    readFileSync(new URL("../.testingtokens", import.meta.url), "utf8")
        .split("\n")
        .filter((line) => line.includes("="))
        .map((line) => {
            const i = line.indexOf("=");
            return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
        }),
);

let failed = 0;
for (const [name, base] of Object.entries(targets)) {
    const token = tokens[name];
    if (!token) {
        console.log(`${name}: missing from .testingtokens`);
        failed++;
        continue;
    }
    const res = await fetch(`${base}/account/balance`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
    });
    console.log(
        `${name}: ${res.status}${res.ok ? "" : " — re-mint this token"}`,
    );
    if (!res.ok) failed++;
}
process.exit(failed ? 1 : 0);
