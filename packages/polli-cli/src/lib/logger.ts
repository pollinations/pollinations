import { existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(homedir(), ".pollinations", "logs");
const LOG_FILE = join(LOG_DIR, "activity.log");
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

let _loggerInitialized = false;

export async function initLogger(): Promise<void> {
    if (_loggerInitialized) return;
    if (!existsSync(LOG_DIR)) {
        mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
    }
    // Rotate log if too large
    if (existsSync(LOG_FILE)) {
        const stats = await import("node:fs").then((fs) => fs.statSync(LOG_FILE));
        if (stats.size > MAX_LOG_SIZE) {
            const backup = join(LOG_DIR, `activity-${Date.now()}.log`);
            await import("node:fs").then((fs) => {
                fs.renameSync(LOG_FILE, backup);
            });
        }
    }
    _loggerInitialized = true;
}

export function logActivity(event: string, data: Record<string, unknown>): void {
    if (!_loggerInitialized) return;
    const entry = {
        timestamp: new Date().toISOString(),
        event,
        ...data,
    };
    const line = JSON.stringify(entry) + "\n";
    try {
        appendFileSync(LOG_FILE, line, "utf-8");
    } catch {
        // ignore logging errors
    }
}

export function getLogFilePath(): string {
    return LOG_FILE;
}