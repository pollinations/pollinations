import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printResult,
    printTable,
} from "../lib/output.js";

interface EarningsRow {
    date: string;
    source: string;
    entity_id: string;
    entity_name: string;
    requests: number;
    baseline_price: number;
    cost_usd: number;
    reward_rate: number;
}

interface EarningsResponse {
    daily: EarningsRow[];
    perEntity: EarningsRow[];
}

export const earningsCommand = new Command("earnings")
    .description("Show developer earnings from community models and BYOP apps")
    .option("--days <n>", "Number of days to look back", "30")
    .option(
        "--json",
        "Output in JSON format (default: table for terminal, JSON for pipe)",
    )
    .action(async (opts) => {
        const key = requireKey();
        const days = Number.parseInt(opts.days, 10);

        if (Number.isNaN(days) || days < 1 || days > 365) {
            printError("--days must be between 1 and 365");
            process.exit(1);
        }

        try {
            const data = await gen<EarningsResponse>(
                `/account/earnings?days=${days}`,
                { apiKey: key },
            );

            const mode = getOutputMode(opts.json);

            if (mode === "json") {
                printResult(data);
                return;
            }

            if (data.perEntity.length === 0) {
                printResult({
                    message: `No earnings in the last ${days} days`,
                });
                return;
            }

            const totalEarned = data.perEntity.reduce(
                (sum, r) => sum + r.cost_usd,
                0,
            );
            const totalRequests = data.perEntity.reduce(
                (sum, r) => sum + r.requests,
                0,
            );

            console.log(chalk.cyan(`\n📊 Earnings (last ${days} days)\n`));
            printTable(
                data.perEntity.map((r) => ({
                    entity: r.entity_name,
                    source: r.source,
                    requests: r.requests,
                    earned: `$${r.cost_usd.toFixed(4)}`,
                    rate: `${(r.reward_rate * 100).toFixed(1)}%`,
                })),
            );
            console.log(
                chalk.green(
                    `\n💰 Total: $${totalEarned.toFixed(4)} from ${totalRequests} requests\n`,
                ),
            );
        } catch (err) {
            printError(err);
            process.exit(1);
        }
    });
