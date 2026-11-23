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

// npm exports its variables in the platform's casing. Windows uses
// NPM_CONFIG_USER_AGENT/NPM_PACKAGE_JSON, and is-npm still finds those when
// only the lowercase names are cleared, so the child looks like an npm script
// and update-notifier suppresses the notice. Remove both spellings so the
// child behaves like a direct CLI run on every platform.
const clearedEnvKeys =
    /^(ci|no_update_notifier|node_env|npm_lifecycle_event|npm_config_user_agent|npm_package_json)$/i;

function childEnv(settings: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
        if (clearedEnvKeys.test(key)) delete env[key];
    }
    return {
        ...env,
        XDG_CONFIG_HOME: config,
        NODE_ENV: "production",
        ...settings,
    };
}

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
            env: childEnv(settings),
        },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("command output\n");
    if (notice) expect(result.stderr).toContain("polli update");
    else expect(result.stderr).toBe("");
});
