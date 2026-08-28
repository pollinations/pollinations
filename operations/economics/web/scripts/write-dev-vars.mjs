import { chmod, rename, writeFile } from "node:fs/promises";

function required(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

const target = new URL("../.dev.vars", import.meta.url);
const temporary = new URL("../.dev.vars.tmp", import.meta.url);
const contents = [
    `POLLINATIONS_AUTH_ALLOWED_EMAILS=${JSON.stringify(required("POLLINATIONS_AUTH_ALLOWED_EMAILS"))}`,
    `POLLINATIONS_AUTH_SESSION_SECRET=${JSON.stringify(required("POLLINATIONS_AUTH_SESSION_SECRET"))}`,
    `POLLINATIONS_OAUTH_CLIENT_ID=${JSON.stringify(required("POLLINATIONS_OAUTH_CLIENT_ID"))}`,
    `TINYBIRD_ECONOMICS_READ_TOKEN=${JSON.stringify(required("TINYBIRD_ECONOMICS_READ_TOKEN"))}`,
    'TINYBIRD_POLLEN_PIPE="economics_pollen_usage_snapshot_api"',
    "",
].join("\n");

await writeFile(temporary, contents, { mode: 0o600 });
await rename(temporary, target);
await chmod(target, 0o600);
console.log("Wrote .dev.vars with OAuth and the staging Tinybird reader.");
