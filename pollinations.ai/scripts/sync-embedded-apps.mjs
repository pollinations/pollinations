import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(siteRoot, "..");
const embeddedAppsRoot = path.join(siteRoot, "public/_apps");

const embeddedApps = [
    {
        name: "playground",
        source: path.join(repoRoot, "apps/playground/dist"),
        target: path.join(siteRoot, "public/_apps/playground"),
    },
    {
        name: "catgpt",
        source: path.join(repoRoot, "apps/catgpt/dist"),
        target: path.join(siteRoot, "public/_apps/catgpt"),
    },
];

await rm(embeddedAppsRoot, { recursive: true, force: true });

for (const app of embeddedApps) {
    await mkdir(path.dirname(app.target), { recursive: true });
    await cp(app.source, app.target, { recursive: true });
    console.log(`synced ${app.name} to ${path.relative(siteRoot, app.target)}`);
}
