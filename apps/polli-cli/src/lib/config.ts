import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".pollinations");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");

export type Modality = "text" | "image" | "audio" | "video";

export interface PolliConfig {
	/** @deprecated Use per-modality defaults instead */
	defaultModel?: string;
	textModel?: string;
	imageModel?: string;
	audioModel?: string;
	videoModel?: string;
	baseUrl?: string;
}

export interface PolliCredentials {
	apiKey?: string;
	keyType?: "pk" | "sk";
}

const ensureDir = () => {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
	}
};

const readJson = <T>(path: string): T | null => {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as T;
	} catch {
		return null;
	}
};

export const loadConfig = (): PolliConfig => readJson(CONFIG_FILE) ?? {};

export const saveConfig = (config: PolliConfig) => {
	ensureDir();
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
};

export const loadCredentials = (): PolliCredentials =>
	readJson(CREDENTIALS_FILE) ?? {};

export const saveCredentials = (creds: PolliCredentials) => {
	ensureDir();
	writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
		encoding: "utf-8",
		mode: 0o600,
	});
};

export const clearCredentials = () => {
	try {
		unlinkSync(CREDENTIALS_FILE);
	} catch {
		// file didn't exist
	}
};

/** Module-level override set by --key flag (avoids leaking to process.env) */
let _keyOverride: string | undefined;

export const setKeyOverride = (key: string) => {
	_keyOverride = key;
};

/** Resolve the API key — flag override > env > stored credentials */
export const resolveApiKey = (flagKey?: string): string | undefined =>
	flagKey ??
	_keyOverride ??
	process.env.POLLINATIONS_API_KEY ??
	process.env.POLLI_KEY ??
	loadCredentials().apiKey;

export const BASE_URL =
	process.env.POLLINATIONS_BASE_URL ?? "https://gen.pollinations.ai";

export const ENTER_URL =
	process.env.POLLINATIONS_ENTER_URL ?? "https://enter.pollinations.ai";

/** Hardcoded fallback defaults per modality */
const MODEL_DEFAULTS: Record<Modality, string> = {
	text: "openai",
	image: "flux",
	audio: "tts-1",
	video: "wan",
};

/**
 * Resolve which model to use. Priority:
 *   1. --model flag (passed by user on this command)
 *   2. POLLI_TEXT_MODEL / POLLI_IMAGE_MODEL / etc. env var
 *   3. Saved config (polli config set image.model ...)
 *   4. Hardcoded default
 */
export const resolveModel = (modality: Modality, flagValue?: string): string => {
	if (flagValue) return flagValue;

	const envKey = `POLLI_${modality.toUpperCase()}_MODEL`;
	const envVal = process.env[envKey];
	if (envVal) return envVal;

	const config = loadConfig();
	const configKey = `${modality}Model` as keyof PolliConfig;
	const configVal = config[configKey];
	if (configVal) return configVal;

	return MODEL_DEFAULTS[modality];
};
