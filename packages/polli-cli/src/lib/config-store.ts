import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".pollinations");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface PolliConfig {
    defaults?: {
        model?: {
            text?: string;
            image?: string;
            audio?: string;
            video?: string;
        };
        width?: number;
        height?: number;
        voice?: string;
        format?: string;
        outputDir?: string;
    };
    preferences?: {
        locale?: string;
        quiet?: boolean;
        verbose?: boolean;
        noColor?: boolean;
    };
    cache?: {
        modelsTTL?: number; // seconds
    };
}

let _config: PolliConfig | null = null;

export function loadConfig(): PolliConfig {
    if (_config) return _config;
    if (!existsSync(CONFIG_FILE)) {
        _config = {};
        return _config;
    }
    try {
        const data = readFileSync(CONFIG_FILE, "utf-8");
        _config = JSON.parse(data) as PolliConfig;
        return _config;
    } catch {
        _config = {};
        return _config;
    }
}

export function saveConfig(config: PolliConfig): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
    });
    _config = config;
}

export function getConfigKey<T>(key: string, fallback?: T): T | undefined {
    const config = loadConfig();
    const parts = key.split(".");
    let current: unknown = config;
    for (const part of parts) {
        if (current && typeof current === "object" && part in current) {
            current = (current as Record<string, unknown>)[part];
        } else {
            return fallback;
        }
    }
    return (current as T) ?? fallback;
}

export function setConfigKey(key: string, value: unknown): void {
    const config = loadConfig();
    const parts = key.split(".");
    let current: Record<string, unknown> = config as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== "object") {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }
    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
    saveConfig(config);
}

export function removeConfigKey(key: string): boolean {
    const config = loadConfig();
    const parts = key.split(".");
    let current: Record<string, unknown> = config as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== "object") {
            return false;
        }
        current = current[part] as Record<string, unknown>;
    }
    const lastPart = parts[parts.length - 1];
    if (lastPart in current) {
        delete current[lastPart];
        saveConfig(config);
        return true;
    }
    return false;
}

export function clearConfig(): void {
    try {
        unlinkSync(CONFIG_FILE);
    } catch {
        // ignore
    }
    _config = null;
}

export function getDefaultModel(type: "text" | "image" | "audio" | "video"): string | undefined {
    return getConfigKey(`defaults.model.${type}`);
}

export function getDefaultWidth(): number {
    return getConfigKey("defaults.width", 1024);
}

export function getDefaultHeight(): number {
    return getConfigKey("defaults.height", 1024);
}

export function getDefaultVoice(): string {
    return getConfigKey("defaults.voice", "sage");
}

export function getDefaultFormat(): string {
    return getConfigKey("defaults.format", "mp3");
}

export function getOutputDir(): string {
    return getConfigKey("defaults.outputDir", ".");
}

export function getLocale(): string {
    return getConfigKey("preferences.locale", "en");
}