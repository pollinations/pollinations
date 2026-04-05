import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import { ENTER_URL } from "../lib/config.js";
import { printError, printInfo } from "../lib/output.js";

const DOCS_URL = `${ENTER_URL}/api/docs`;
const LLM_TXT_URL = `${ENTER_URL}/api/docs/llm.txt`;

async function fetchLlmTxt(): Promise<string> {
    const res = await fetch(LLM_TXT_URL, {
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
    }
    return res.text();
}

export const docsCommand = new Command("docs")
    .description("Show Pollinations API documentation")
    .argument(
        "[endpoint]",
        "Filter docs to a specific endpoint (e.g. /image, /v1/chat/completions)",
    )
    .option("--open", "Open documentation in browser instead of printing")
    .action(async (endpoint: string | undefined, opts: { open?: boolean }) => {
        // Default: print to terminal. --open: launch browser.
        if (!opts.open) {
            try {
                const doc = await fetchLlmTxt();

                if (endpoint) {
                    // Filter to lines relevant to the endpoint
                    const sections = doc.split(/^(?=###? )/m);
                    const needle = endpoint.replace(/^\//, "").toLowerCase();
                    const matches = sections.filter((s) => {
                        const header = s.split("\n")[0].toLowerCase();
                        return header.includes(needle);
                    });

                    if (matches.length === 0) {
                        printError(`No docs found matching "${endpoint}"`);
                        printInfo(
                            `Available endpoints can be found with: polli docs`,
                        );
                        process.exit(1);
                    }

                    process.stdout.write(matches.join("\n"));
                } else {
                    process.stdout.write(doc);
                    process.stdout.write("\n");
                }
            } catch (err) {
                printError(
                    `Failed to fetch docs: ${err instanceof Error ? err.message : "unknown"}`,
                );
                process.exit(1);
            }
            return;
        }

        // --open: launch browser
        const url = endpoint
            ? `${DOCS_URL}#tag/${encodeURIComponent(endpoint.replace(/^\//, ""))}`
            : DOCS_URL;

        printInfo(`Opening ${chalk.underline(url)}`);
        await open(url);
    });
