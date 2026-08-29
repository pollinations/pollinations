import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { printInfo } from "../lib/output.js";
import { writeJsonAtomic } from "./atomic-write.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessResult,
} from "./types.js";

const PLUGIN_PACKAGE = "opencode-pollinations-plugin";
const OPENCODE_PACKAGE = "opencode-ai@latest";

type OpenCodeConfig = Record<string, unknown> & {
    plugin?: unknown;
    plugins?: unknown;
};

const defaultContext = (): HarnessContext => ({
    env: process.env,
    homeDir: homedir(),
});

const executable = (command: string): string =>
    process.platform === "win32" ? `${command}.cmd` : command;

const hasOpenCode = (): boolean =>
    spawnSync(executable("opencode"), ["--version"], {
        stdio: "ignore",
    }).status === 0;

const installOpenCode = (): void => {
    printInfo(`OpenCode not found. Installing ${OPENCODE_PACKAGE}...`);
    const install = spawnSync(
        executable("npm"),
        ["install", "--global", OPENCODE_PACKAGE],
        { stdio: ["inherit", process.stderr, process.stderr] },
    );
    if (install.error) throw install.error;
    if (install.status !== 0) {
        throw new Error(`Official OpenCode installer exited with status ${install.status}`);
    }
    if (!hasOpenCode()) {
        throw new Error(
            "OpenCode was installed but is not on PATH. Open a new terminal and run this command again.",
        );
    }
};

const configPath = (context: HarnessContext): string => {
    const configDir = context.env.OPENCODE_CONFIG_DIR;
    return join(
        configDir
            ? resolve(configDir)
            : join(context.homeDir, ".config", "opencode"),
        "opencode.json",
    );
};

const pluginName = (entry: unknown): string => {
    if (typeof entry === "string") return entry;
    if (!entry || typeof entry !== "object") return "";

    const value = entry as Record<string, unknown>;
    const name = value.package ?? value.id ?? value.name;
    return typeof name === "string" ? name : "";
};

const isPollinationsPlugin = (entry: unknown): boolean => {
    const name = pluginName(entry);
    return name === PLUGIN_PACKAGE || name.startsWith(`${PLUGIN_PACKAGE}@`);
};

const readConfig = async (path: string): Promise<OpenCodeConfig> => {
    if (!existsSync(path)) return {};

    let config: unknown;
    try {
        config = JSON.parse(await readFile(path, "utf-8"));
    } catch (error) {
        const message = error instanceof Error ? error.message : "invalid JSON";
        throw new Error(`Could not read ${path}: ${message}`);
    }

    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error(`Could not read ${path}: expected a JSON object`);
    }
    return config as OpenCodeConfig;
};

const pluginEntries = (config: OpenCodeConfig): unknown[] => {
    if (config.plugin !== undefined && !Array.isArray(config.plugin)) {
        throw new Error('OpenCode config field "plugin" must be an array');
    }
    if (config.plugins !== undefined && !Array.isArray(config.plugins)) {
        throw new Error('OpenCode config field "plugins" must be an array');
    }
    return Array.isArray(config.plugin)
        ? config.plugin
        : Array.isArray(config.plugins)
          ? config.plugins
          : [];
};

const isConfigured = (config: OpenCodeConfig): boolean =>
    pluginEntries(config).some(isPollinationsPlugin);

const result = (
    path: string,
    installed: boolean,
    configured: boolean,
    changed?: boolean,
): HarnessResult => ({
    harness: "opencode",
    installed,
    configured,
    ...(changed === undefined ? {} : { changed }),
    configPath: path,
    next:
        configured && changed
            ? "Restart OpenCode, then run /poll login"
            : undefined,
});

export const opencodeHarness: HarnessAdapter = {
    id: "opencode",
    name: "OpenCode",
    description: "Manage the Pollinations OpenCode plugin",

    async on(context = defaultContext()) {
        const installed = hasOpenCode();
        if (!installed) installOpenCode();

        const path = configPath(context);
        const config = await readConfig(path);
        const entries = pluginEntries(config);

        if (isConfigured(config)) {
            return result(path, true, true, false);
        }

        const key = Array.isArray(config.plugin)
            ? "plugin"
            : Array.isArray(config.plugins)
              ? "plugins"
              : "plugin";
        config[key] = [...entries, PLUGIN_PACKAGE];

        await writeJsonAtomic(path, config);
        return result(path, true, true, true);
    },

    async off(context = defaultContext()) {
        const path = configPath(context);
        const config = await readConfig(path);
        const entries = pluginEntries(config);

        if (!entries.some(isPollinationsPlugin)) {
            return result(path, hasOpenCode(), false, false);
        }

        const key = Array.isArray(config.plugin) ? "plugin" : "plugins";
        const remaining = entries.filter(
            (entry) => !isPollinationsPlugin(entry),
        );
        if (remaining.length === 0) {
            delete config[key];
        } else {
            config[key] = remaining;
        }
        await writeJsonAtomic(path, config);
        return result(path, hasOpenCode(), false, true);
    },

    async status(context = defaultContext()) {
        const path = configPath(context);
        const config = await readConfig(path);
        return result(path, hasOpenCode(), isConfigured(config));
    },
};
