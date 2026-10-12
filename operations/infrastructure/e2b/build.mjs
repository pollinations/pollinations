// Builds an E2B template from e2b.Dockerfile without E2B's layer cache, so the
// image gets the current npm releases of polli and the harnesses. Not with the
// e2b CLI: up to 2.21.2, `template create --no-cache` still reuses cached
// layers (it passes `skipCache: t.noCache`, which is always undefined).
// Usage, after `npm ci` here: E2B_API_KEY=... node build.mjs <template> [name]
// [name] builds the template under another name, like pollinations-test, at the
// template's size.
import { readFileSync } from "node:fs";
import { defaultBuildLogger, Template } from "e2b";

const sizes = {
    pollinations: { cpuCount: 2, memoryMB: 2048 },
    "pollinations-large": { cpuCount: 4, memoryMB: 8192 },
};
const [template, name = template] = process.argv.slice(2);
if (!Object.hasOwn(sizes, template)) {
    console.error(
        "Usage: node build.mjs pollinations|pollinations-large [name]",
    );
    process.exit(1);
}

const dir = import.meta.dirname;
const dockerfile = readFileSync(`${dir}/e2b.Dockerfile`, "utf8");
await Template.build(
    Template({ fileContextPath: dir }).fromDockerfile(dockerfile),
    name,
    {
        ...sizes[template],
        skipCache: true,
        onBuildLogs: defaultBuildLogger(),
    },
);
