import { chmod, readFile, rename, writeFile } from "node:fs/promises";

const target = new URL("../.dev.vars", import.meta.url);
const temporary = new URL("../.dev.vars.tmp", import.meta.url);
// Preserve the separately approved local signing secret. Never generate one,
// import production credentials, or bring back the retired shared password.
const existing = await readFile(target, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
});
const sessionLine = existing
    .split("\n")
    .find((line) => line.startsWith("POLLINATIONS_AUTH_SESSION_SECRET="));
if (!sessionLine)
    throw new Error(
        "Add the approved local POLLINATIONS_AUTH_SESSION_SECRET before decrypt-vars",
    );
const reader = process.env.TINYBIRD_ECONOMICS_READ_TOKEN;
if (!reader) throw new Error("Missing staging TINYBIRD_ECONOMICS_READ_TOKEN");
await writeFile(
    temporary,
    [
        sessionLine,
        `TINYBIRD_ECONOMICS_READ_TOKEN=${JSON.stringify(reader)}`,
        'POLLINATIONS_AUTH_BASE_URL="http://localhost:3000"',
        'TINYBIRD_POLLEN_PIPE="economics_pollen_usage_snapshot_api"',
        "",
    ].join("\n"),
    { mode: 0o600 },
);
await rename(temporary, target);
await chmod(target, 0o600);
console.log(
    "Wrote local variables with the staging reader; preserved the app signing secret.",
);
