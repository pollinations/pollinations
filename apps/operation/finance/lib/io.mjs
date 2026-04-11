import { existsSync } from "node:fs";
import {
    copyFile,
    mkdir,
    readdir,
    readFile,
    writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG_PATH = join(APP_DIR, "config.local.json");
const VENDORS_PATH = join(APP_DIR, "secrets", "vendors.json");
const INPUT_DIR = join(APP_DIR, "secrets", "input");

export function appDir() {
    return APP_DIR;
}

export async function loadConfig() {
    if (!existsSync(CONFIG_PATH)) {
        throw new Error(
            `Missing ${CONFIG_PATH}. Copy config.example.json to config.local.json and edit it.`,
        );
    }
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

export async function loadVendors() {
    if (!existsSync(VENDORS_PATH)) {
        await mkdir(dirname(VENDORS_PATH), { recursive: true });
        await writeFile(VENDORS_PATH, "{}\n");
        return {};
    }
    return JSON.parse(await readFile(VENDORS_PATH, "utf8"));
}

export async function saveVendors(vendors) {
    await mkdir(dirname(VENDORS_PATH), { recursive: true });
    await writeFile(VENDORS_PATH, `${JSON.stringify(vendors, null, 2)}\n`);
}

export async function listInputCsvs() {
    if (!existsSync(INPUT_DIR)) {
        await mkdir(INPUT_DIR, { recursive: true });
        return [];
    }
    const files = await readdir(INPUT_DIR);
    return files
        .filter((f) => f.endsWith(".csv"))
        .sort()
        .map((f) => join(INPUT_DIR, f));
}

export async function readText(path) {
    return readFile(path, "utf8");
}

export async function copyIntoInput(sourcePath, destName) {
    await mkdir(INPUT_DIR, { recursive: true });
    const dest = join(INPUT_DIR, destName);
    await copyFile(sourcePath, dest);
    return dest;
}
