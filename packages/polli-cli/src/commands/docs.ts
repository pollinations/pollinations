import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import { BASE_URL } from "../lib/config.js";
import {
    ExitSignal,
    fail,
    getOutputMode,
    printError,
    printInfo,
    printResult,
} from "../lib/output.js";

const DOCS_URL = `${BASE_URL}/docs`;
const LLM_TXT_URL = `${BASE_URL}/docs/llm.txt`;

async function fetchLlmTxt(): Promise<string> {
    const res = await fetch(LLM_TXT_URL, {
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
    }
    return res.text();
}

// Light markdown polish for human terminals. Agents get raw text via --json or piped output.
function styleMarkdown(md: string): string {
    return md
        .replace(/^(#{1,6}) (.+)$/gm, (_, hashes: string, text: string) =>
            chalk.hex("#a78bfa").bold(`${hashes} ${text}`),
        )
        .replace(/```([\s\S]*?)```/g, (block) => chalk.dim(block))
        .replace(/`([^`\n]+)`/g, (_, code: string) => chalk.cyan(code));
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
                const isJson = getOutputMode() === "json";

                let content = doc;
                if (endpoint) {
                    const sections = [""];
                    let inFence = false;
                    for (const line of doc.split(/(?<=\n)/)) {
                        if (line.startsWith("```")) inFence = !inFence;
                        // Shell comments inside examples are not headings.
                        if (!inFence && /^#{1,6} /.test(line)) {
                            sections.push("");
                        }
                        sections[sections.length - 1] += line;
                    }
                    const needle = endpoint.replace(/^\//, "").toLowerCase();
                    const headingMatches = sections.filter((s) =>
                        s.split("\n")[0].toLowerCase().includes(needle),
                    );
                    const matches = headingMatches.length
                        ? headingMatches
                        : sections.filter((s) =>
                              s.toLowerCase().includes(needle),
                          );

                    if (matches.length === 0) {
                        printError(`No docs found matching "${endpoint}"`);
                        printInfo(
                            `Available endpoints can be found with: polli docs`,
                        );
                        throw new ExitSignal(1);
                    }

                    content = matches.join("\n");
                }

                if (isJson) {
                    printResult({ endpoint: endpoint ?? null, content });
                } else {
                    process.stdout.write(styleMarkdown(content));
                    process.stdout.write("\n");
                }
            } catch (err) {
                fail("Failed to fetch docs", err);
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
