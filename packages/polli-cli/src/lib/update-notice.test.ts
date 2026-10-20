import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { afterAll, beforeEach, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const config = mkdtempSync(join(tmpdir(), "polli-notice-"));
const cache = join(
    config,
    "configstore/update-notifier-@pollinations/cli.json",
);
// Exercise the real library in a child process, including its exit-time notice.
const code = buildSync({
    stdin: {
        contents: `
            import {notifyUpdate} from './src/lib/update-notice.ts';
            import {setOutputMode} from './src/lib/output.ts';
            Object.defineProperty(process.stdout, 'isTTY', {value: process.env.TEST_PIPE !== '1'});
            Object.defineProperty(process.stderr, 'isTTY', {value: process.env.TEST_STDERR !== '1'});
            if (process.env.TEST_JSON) setOutputMode('json');
            console.log('command output');
            await notifyUpdate({name: '@pollinations/cli', version: '1.0.0'});
        `,
        resolveDir: root,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    write: false,
}).outputFiles[0].text;

beforeEach(() => {
    mkdirSync(dirname(cache), { recursive: true });
    writeFileSync(
        cache,
        JSON.stringify({
            lastUpdateCheck: Date.now(),
            update: {
                current: "1.0.0",
                latest: "2.0.0",
                name: "@pollinations/cli",
                type: "major",
            },
        }),
    );
});
afterAll(() => rmSync(config, { recursive: true, force: true }));

it.each([
    [{}, true],
    [{ TEST_JSON: "1" }, false],
    [{ TEST_PIPE: "1" }, false],
    [{ TEST_STDERR: "1" }, false],
    [{ NO_UPDATE_NOTIFIER: "1" }, false],
    [{ CI: "1" }, false],
    [{ npm_config_user_agent: "npm/11" }, false],
])("preserves output and respects notice settings %j", (settings, notice) => {
    const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", code],
        {
            cwd: root,
            encoding: "utf8",
            timeout: 5000,
            env: {
                ...process.env,
                XDG_CONFIG_HOME: config,
                NODE_ENV: "production",
                CI: undefined,
                NO_UPDATE_NOTIFIER: undefined,
                npm_lifecycle_event: undefined,
                npm_config_user_agent: undefined,
                npm_package_json: undefined,
                ...settings,
            },
        },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("command output\n");
    if (notice) expect(result.stderr).toContain("polli update");
    else expect(result.stderr).toBe("");
});
