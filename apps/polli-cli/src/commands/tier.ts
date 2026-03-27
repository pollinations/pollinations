import { Command } from "commander";
import ora from "ora";
import { requireKey, enter } from "../lib/api.js";
import {
	getOutputMode,
	printError,
	printResult,
	printTable,
} from "../lib/output.js";

const TIER_CONFIG_URL =
	"https://raw.githubusercontent.com/pollinations/pollinations/main/enter.pollinations.ai/src/tier-config.ts";

interface TierInfo {
	tier: string;
	pollen: number;
	emoji: string;
	cadence: string;
}

/** Fetch live tier config from the repo source of truth. */
async function fetchTierConfig(): Promise<TierInfo[]> {
	const res = await fetch(TIER_CONFIG_URL, {
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok) throw new Error(`Failed to fetch tier config: ${res.status}`);

	const text = await res.text();
	const matches = [
		...text.matchAll(
			/(\w+):\s*\{\s*pollen:\s*([\d.]+).*?emoji:\s*"([^"]+)".*?cadence:\s*"(\w+)"/g,
		),
	];

	if (matches.length === 0) throw new Error("Could not parse tier config");

	return matches.map((m) => ({
		tier: m[1],
		pollen: Number(m[2]),
		emoji: m[3],
		cadence: m[4],
	}));
}

/** Format pollen amount with cadence for display. */
function formatPollen(pollen: number, cadence: string): string {
	if (pollen === 0) return "0";
	if (cadence === "hourly") return `${pollen}/hr`;
	if (cadence === "daily") return `${pollen}/day`;
	return String(pollen);
}

const status = new Command("status")
	.description("Show your tier progression")
	.action(async () => {
		const key = requireKey();
		const isHuman = getOutputMode() === "human";
		const spinner = isHuman ? ora("Fetching tier info...").start() : null;

		try {
			const [profile, tiers] = await Promise.all([
				enter<Record<string, unknown>>("/api/account/profile", { apiKey: key }),
				fetchTierConfig().catch(() => null),
			]);

			spinner?.stop();

			const currentTier = profile.tier as string;
			const tierList = tiers ?? [];
			const currentIdx = tierList.findIndex((t) => t.tier === currentTier);
			const nextTier = currentIdx >= 0 && currentIdx < tierList.length - 1
				? tierList[currentIdx + 1]
				: null;

			printResult({
				current_tier: `${tierList[currentIdx]?.emoji ?? ""} ${currentTier}`.trim(),
				pollen_rate: currentIdx >= 0
					? formatPollen(tierList[currentIdx].pollen, tierList[currentIdx].cadence)
					: "unknown",
				refill: tierList[currentIdx]?.cadence ?? "unknown",
				next_reset: profile.nextResetAt ?? "unknown",
				next_tier: nextTier ? `${nextTier.emoji} ${nextTier.tier}` : "max tier",
			});
		} catch (err) {
			spinner?.fail("Could not fetch tier status");
			printError(err instanceof Error ? err.message : "unknown error");
		}
	});

const roadmap = new Command("roadmap")
	.description("Show all tiers and how to upgrade")
	.action(async () => {
		const isHuman = getOutputMode() === "human";
		const spinner = isHuman ? ora("Fetching tier info...").start() : null;

		try {
			const tiers = await fetchTierConfig();
			spinner?.stop();

			const rows = tiers.map((t) => ({
				tier: `${t.emoji} ${t.tier}`,
				pollen: formatPollen(t.pollen, t.cadence),
				refill: t.cadence,
			}));

			printTable(rows, ["tier", "pollen", "refill"]);
		} catch (err) {
			spinner?.fail("Could not fetch tier info");
			printError(err instanceof Error ? err.message : "unknown error");
		}
	});

export const tierCommand = new Command("tier")
	.description("View tier info and progression")
	.addCommand(status)
	.addCommand(roadmap);
