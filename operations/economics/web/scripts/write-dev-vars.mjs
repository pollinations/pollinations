import { randomBytes } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";

function required(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

const target = new URL("../.dev.vars", import.meta.url);
const temporary = new URL("../.dev.vars.tmp", import.meta.url);

// The dashboard session secret only signs local cookies. Keep the previous
// local value so `npm run dev` does not sign you out on every start.
const existing = await readFile(target, "utf8").catch(() => "");

function existingValue(name) {
    return existing.match(new RegExp(`^${name}="?([^"\\n]+)"?$`, "m"))?.[1];
}

function localSessionSecret() {
    return (
        existingValue("POLLINATIONS_AUTH_SESSION_SECRET") ||
        randomBytes(32).toString("hex")
    );
}

// Optional: point login at a local Enter (e.g. http://localhost:3000). Taken
// from the environment or kept from the previous .dev.vars.
const authBaseUrl =
    process.env.POLLINATIONS_AUTH_BASE_URL ||
    existingValue("POLLINATIONS_AUTH_BASE_URL");

const contents = [
    `POLLINATIONS_AUTH_SESSION_SECRET=${JSON.stringify(localSessionSecret())}`,
    ...(authBaseUrl
        ? [`POLLINATIONS_AUTH_BASE_URL=${JSON.stringify(authBaseUrl)}`]
        : []),
    `TINYBIRD_ECONOMICS_READ_TOKEN=${JSON.stringify(required("TINYBIRD_ECONOMICS_READ_TOKEN"))}`,
    'TINYBIRD_POLLEN_PIPE="economics_pollen_usage_snapshot_api"',
    "",
].join("\n");

await writeFile(temporary, contents, { mode: 0o600 });
await rename(temporary, target);
await chmod(target, 0o600);
console.log("Wrote .dev.vars with the staging Tinybird reader.");
