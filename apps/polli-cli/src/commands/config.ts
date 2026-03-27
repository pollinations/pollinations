import { Command } from "commander";
import { loadConfig, saveConfig, resolveModel } from "../lib/config.js";
import type { Modality, PolliConfig } from "../lib/config.js";
import {
	printError,
	printResult,
	printSuccess,
	printTable,
} from "../lib/output.js";

/** Map user-friendly dot keys to PolliConfig keys */
const KEY_MAP: Record<string, keyof PolliConfig> = {
	"text.model": "textModel",
	"image.model": "imageModel",
	"audio.model": "audioModel",
	"video.model": "videoModel",
	"base.url": "baseUrl",
	// Also accept flat keys
	textModel: "textModel",
	imageModel: "imageModel",
	audioModel: "audioModel",
	videoModel: "videoModel",
	baseUrl: "baseUrl",
};

const VALID_KEYS_DISPLAY = "text.model, image.model, audio.model, video.model, base.url";

const resolveKey = (input: string): keyof PolliConfig | null =>
	KEY_MAP[input] ?? null;

const get = new Command("get")
	.description("Get a config value")
	.argument("<key>", `Config key (${VALID_KEYS_DISPLAY})`)
	.action((key) => {
		const resolved = resolveKey(key);
		if (!resolved) {
			printError(`Unknown key: ${key}\nValid keys: ${VALID_KEYS_DISPLAY}`);
			process.exit(1);
		}
		const config = loadConfig();
		printResult({ [key]: config[resolved] ?? null });
	});

const set = new Command("set")
	.description("Set a config value")
	.argument("<key>", `Config key (${VALID_KEYS_DISPLAY})`)
	.argument("<value>", "Value to set")
	.action((key, value) => {
		const resolved = resolveKey(key);
		if (!resolved) {
			printError(`Unknown key: ${key}\nValid keys: ${VALID_KEYS_DISPLAY}`);
			process.exit(1);
		}
		const config = loadConfig();
		const updated = { ...config, [resolved]: value };
		saveConfig(updated);
		printSuccess(`${key} = ${value}`);
	});

const unset = new Command("unset")
	.description("Remove a config value (revert to default)")
	.argument("<key>", `Config key (${VALID_KEYS_DISPLAY})`)
	.action((key) => {
		const resolved = resolveKey(key);
		if (!resolved) {
			printError(`Unknown key: ${key}\nValid keys: ${VALID_KEYS_DISPLAY}`);
			process.exit(1);
		}
		const config = loadConfig();
		const { [resolved]: _, ...rest } = config;
		saveConfig(rest as PolliConfig);
		printSuccess(`${key} unset (reverted to default)`);
	});

const show = new Command("show")
	.description("Show all config including resolved defaults")
	.action(() => {
		const config = loadConfig();
		const modalities: Modality[] = ["text", "image", "audio", "video"];

		const rows = modalities.map((m) => {
			const configKey = `${m}Model` as keyof PolliConfig;
			const saved = config[configKey] as string | undefined;
			const resolved = resolveModel(m);
			return {
				setting: `${m}.model`,
				value: saved ?? "",
				active: resolved,
				source: saved ? "config" : "default",
			};
		});

		if (config.baseUrl) {
			rows.push({
				setting: "base.url",
				value: config.baseUrl,
				active: config.baseUrl,
				source: "config",
			});
		}

		printTable(rows, ["setting", "active", "source"]);
	});

const reset = new Command("reset")
	.description("Reset all config to defaults")
	.action(() => {
		saveConfig({});
		printSuccess("Config reset to defaults");
	});

export const configCommand = new Command("config")
	.description("Manage CLI configuration (models, defaults)")
	.addCommand(show, { isDefault: true })
	.addCommand(get)
	.addCommand(set)
	.addCommand(unset)
	.addCommand(reset);
