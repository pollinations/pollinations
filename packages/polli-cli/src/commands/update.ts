import chalk from "chalk";
import { Command } from "commander";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function loadPkg() {
    const raw = readFileSync(
        new URL("../package.json", import.meta.url),
        "utf-8",
    );
    return JSON.parse(raw) as { name: string; version: string };
}

const NOTICE_FILE = join(homedir(), ".pollinations", "update-notice.json");

interface NoticeState {
    lastCheck?: number;
    lastSeenVersion?: string;
    disabled?: boolean;
}

function loadNotice(): NoticeState {
    if (!existsSync(NOTICE_FILE)) return {};
    try {
        return JSON.parse(readFileSync(NOTICE_FILE, "utf-8")) as NoticeState;
    } catch {
        return {};
    }
}

function saveNotice(state: NoticeState) {
    try {
        const dir = join(homedir(), ".pollinations");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
        writeFileSync(NOTICE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
    } catch {
        // never crash on a notice
    }
}

async function latestVersion(): Promise<string | null> {
    const name = loadPkg().name || "@pollinations/cli";
    const registry = `https://registry.npmjs.org/${name}`;
    const res = await fetch(registry, {
        headers: { Accept: "application/vnd.npm.install-v1+json" },
        signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { "dist-tags"?: { latest?: string } };
    return data?.["dist-tags"]?.latest ?? null;
}

export function isNewer(latest: string, current: string): boolean {
    try {
        const a = latest.split(".").map(Number);
        const b = current.split(".").map(Number);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const av = a[i] ?? 0;
            const bv = b[i] ?? 0;
            if (av > bv) return true;
            if (av < bv) return false;
        }
        return false;
    } catch {
        return false;
    }
}

export const updateCommand = new Command("update")
    .description(
        "Check for a newer Pollinations CLI version and update",
    )
    .option("-c, --check", "Only check and report the latest version")
    .option("--disable-notices", "Stop showing update notices entirely")
    .option("--enable-notices", "Re-enable update notices after disabling them")
    .action(async (opts) => {
        const state = loadNotice();

        if (opts.disableNotices) {
            state.disabled = true;
            saveNotice(state);
            console.log("Update notices disabled.\nRe-enable with: polli update --enable-notices");
            return;
        }
        if (opts.enableNotices) {
            state.disabled = false;
            saveNotice(state);
            console.log("Update notices enabled.");
            return;
        }

        let latest: string | null = null;
        try {
            latest = await latestVersion();
        } catch {
            latest = null; // offline / registry unreachable
        }

        if (!latest) {
            console.log("Could not reach the npm registry right now — offline or network issue. No update available to report.");
            return;
        }

        const PKG = loadPkg();
        if (isNewer(latest, PKG.version)) {
            console.log(
                chalk.yellow(`A newer ${loadPkg().name} is available: ${loadPkg().version} → ${latest}`),
            );
            if (opts.check) return;
            console.log(
                chalk.dim(`Update with:\n  npm i -g ${PKG.name}@latest`),
            );
            state.lastSeenVersion = latest;
            state.lastCheck = Date.now();
            saveNotice(state);
        } else {
            console.log(`You're on the latest ${loadPkg().name} version (${loadPkg().version}).`);
        }
    });

/**
 * Unobtrusive startup notice shown after normal commands.
 * Returns nothing; never throws and never blocks.
 */
export async function maybeShowUpdateNotice() {
    const PKG = loadPkg();
    try {
        const state = loadNotice();
        if (state.disabled) return;
        // only check at most once per 24h to avoid slowing normal use
        if (state.lastCheck && Date.now() - state.lastCheck < 86_400_000) {
            if (state.lastSeenVersion && isNewer(state.lastSeenVersion, PKG.version)) {
                console.log(
                    chalk.dim(
                        `\nUpdate available: ${PKG.version} → ${state.lastSeenVersion}. Run "polli update" to update.`,
                    ),
                );
            }
            return;
        }
        const latest = await latestVersion();
        if (latest && isNewer(latest, PKG.version)) {
            console.log(
                chalk.dim(
                    `\nUpdate available: ${PKG.version} → ${latest}. Run "polli update" to update.`,
                ),
            );
            state.lastSeenVersion = latest;
        }
        state.lastCheck = Date.now();
        saveNotice(state);
    } catch {
        // silent — never break normal use on update-check failure
    }
}
