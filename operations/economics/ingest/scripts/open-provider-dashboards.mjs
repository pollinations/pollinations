import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const targetsPath = resolve(
    scriptDirectory,
    "../data/provider-audit-targets.json",
);
if (!existsSync(targetsPath)) {
    throw new Error(
        `Private provider dashboard checklist is missing: ${targetsPath}`,
    );
}
const { auditTargets: targets = [] } = JSON.parse(
    readFileSync(targetsPath, "utf8"),
);
const urls = [...new Set(targets.map((target) => target.url))];

if (urls.length === 0) throw new Error("No provider dashboard URLs registered");

for (const target of targets) {
    const account = target.accountId ? ` / ${target.accountId}` : "";
    const login = target.loginEmail ?? "login pending";
    const pending = target.pending ? " [pending]" : "";
    console.log(
        `${target.provider}${account} · ${login}${pending}\n  ${target.url}`,
    );
}

if (process.argv.includes("--list")) process.exit(0);

const launcher = process.platform === "darwin" ? "open" : "xdg-open";
const result = spawnSync(launcher, urls, { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
else {
    const pending = targets.filter((target) => target.pending).length;
    console.log(
        `Opened ${urls.length} provider dashboards (${targets.length} account targets; ${pending} pending verification).`,
    );
}
