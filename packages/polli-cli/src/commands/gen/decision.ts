import { readFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
} from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";

export function createDecisionCommand() {
    return new Command("decision")
        .description(
            "Evaluate state with typed decisions using Jev (choice, score, noul)",
        )
        .option(
            "--model <model>",
            "Decision model (default: typesafe/jev-1.13)",
            "typesafe/jev-1.13",
        )
        .option("--state <state>", "State text or JSON string to evaluate")
        .option("--questions <json>", "Questions JSON map")
        .option(
            "--file <path>",
            "Path to JSON file containing state and questions",
        )
        .action(async (opts) => {
            const isHuman = getOutputMode() === "human";
            let state: unknown;
            let questions: Record<string, unknown> | undefined;

            try {
                if (opts.file) {
                    const content = JSON.parse(
                        readFileSync(opts.file, "utf-8"),
                    );
                    state = content.state;
                    questions = content.questions;
                } else {
                    const stdin = await readStdin();
                    if (stdin) {
                        try {
                            const parsed = JSON.parse(stdin);
                            if (parsed && typeof parsed === "object") {
                                if (
                                    "state" in parsed &&
                                    "questions" in parsed
                                ) {
                                    state = parsed.state;
                                    questions = parsed.questions as Record<
                                        string,
                                        unknown
                                    >;
                                } else {
                                    state = stdin;
                                }
                            } else {
                                state = stdin;
                            }
                        } catch {
                            state = stdin;
                        }
                    }

                    if (opts.state) {
                        try {
                            state = JSON.parse(opts.state);
                        } catch {
                            state = opts.state;
                        }
                    }

                    if (opts.questions) {
                        questions = JSON.parse(opts.questions);
                    }
                }

                if (state === undefined) {
                    printError(
                        "State is required. Provide via --state, --file, or stdin.",
                    );
                    process.exit(1);
                }

                if (
                    !questions ||
                    typeof questions !== "object" ||
                    Object.keys(questions).length === 0
                ) {
                    printError(
                        "Questions map is required. Provide via --questions, --file, or stdin JSON.",
                    );
                    process.exit(1);
                }

                if (isHuman) printInfo("Evaluating decision...");

                const res = await fetchGen("/alpha/decisions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: opts.model,
                        state,
                        questions,
                    }),
                });

                const data = (await res.json()) as Record<string, unknown>;
                printResult(data);
            } catch (error) {
                exitWithError(error);
            }
        });
}
