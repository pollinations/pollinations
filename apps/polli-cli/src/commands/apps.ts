import { Command } from "commander";
import ora from "ora";
import { requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
    printTable,
} from "../lib/output.js";

const REPO = "pollinations/pollinations";

interface GitHubIssue {
    number: number;
    title: string;
    state: string;
    labels: Array<{ name: string }>;
    html_url: string;
    created_at: string;
}

/** Call GitHub API */
const ghApi = async <T>(
    path: string,
    options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> => {
    const { method = "GET", body, token } = options;
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `token ${token}`;

    const res = await fetch(`https://api.github.com${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`GitHub API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
};

const list = new Command("list")
    .description("List registered apps (from GitHub issues)")
    .option(
        "--status <status>",
        "Filter: review, approved, complete, all",
        "all",
    )
    .action(async (opts) => {
        const isHuman = getOutputMode() === "human";
        const spinner = isHuman ? ora("Fetching apps...").start() : null;

        try {
            const labelMap: Record<string, string> = {
                review: "TIER-APP-REVIEW",
                approved: "TIER-APP-APPROVED",
                complete: "TIER-APP-COMPLETE",
                all: "TIER-APP",
            };
            const label = labelMap[opts.status] ?? "TIER-APP";
            const issues = await ghApi<GitHubIssue[]>(
                `/repos/${REPO}/issues?labels=${label}&state=all&per_page=30&sort=created&direction=desc`,
            );

            spinner?.stop();

            printTable(
                issues.map((i) => ({
                    "#": i.number,
                    title: i.title.slice(0, 50),
                    status:
                        i.labels
                            .map((l) => l.name)
                            .find((n) => n.startsWith("TIER-APP-"))
                            ?.replace("TIER-APP-", "")
                            ?.toLowerCase() ?? i.state,
                    date: i.created_at.slice(0, 10),
                    url: i.html_url,
                })),
            );
        } catch (err) {
            spinner?.fail("Failed");
            printError(err instanceof Error ? err.message : "unknown");
            process.exit(1);
        }
    });

const register = new Command("register")
    .description("Submit app for review (creates GitHub issue)")
    .requiredOption("--name <name>", "App name")
    .requiredOption("--url <url>", "App URL or demo link")
    .option("--repo <repo>", "GitHub repository URL")
    .option("--description <desc>", "Short description of the app")
    .action(async (opts) => {
        requireKey();

        const ghToken = process.env.GITHUB_TOKEN;
        if (!ghToken) {
            printError(
                "GITHUB_TOKEN env var required to create issues. Set it and retry.",
            );
            printInfo("Generate one at: https://github.com/settings/tokens");
            process.exit(1);
        }

        const isHuman = getOutputMode() === "human";
        const spinner = isHuman
            ? ora("Submitting app for review...").start()
            : null;

        try {
            const body = [
                `### App Name\n${opts.name}`,
                `### App URL\n${opts.url}`,
                opts.repo ? `### GitHub Repository\n${opts.repo}` : "",
                opts.description ? `### Description\n${opts.description}` : "",
            ]
                .filter(Boolean)
                .join("\n\n");

            const issue = await ghApi<GitHubIssue>(`/repos/${REPO}/issues`, {
                method: "POST",
                token: ghToken,
                body: {
                    title: `[App] ${opts.name}`,
                    body,
                    labels: ["TIER-APP"],
                },
            });

            spinner?.succeed(`App submitted for review`);
            printResult({
                issue: `#${issue.number}`,
                status: "TIER-APP (pending review)",
                url: issue.html_url,
            });
        } catch (err) {
            spinner?.fail("Submission failed");
            printError(err instanceof Error ? err.message : "unknown");
            process.exit(1);
        }
    });

const status = new Command("status")
    .description("Check app review status")
    .argument("<issue>", "Issue number (e.g. 1234)")
    .action(async (issueNum) => {
        const num = issueNum.replace("#", "");
        const isHuman = getOutputMode() === "human";
        const spinner = isHuman ? ora("Checking status...").start() : null;

        try {
            const issue = await ghApi<GitHubIssue>(
                `/repos/${REPO}/issues/${num}`,
            );

            spinner?.stop();

            const appLabel = issue.labels
                .map((l) => l.name)
                .find((n) => n.startsWith("TIER-APP"));

            printResult({
                issue: `#${issue.number}`,
                title: issue.title,
                state: issue.state,
                label: appLabel ?? "none",
                status:
                    appLabel?.replace("TIER-APP-", "").toLowerCase() ??
                    "pending",
                url: issue.html_url,
            });
        } catch (err) {
            spinner?.fail("Failed");
            printError(err instanceof Error ? err.message : "unknown");
            process.exit(1);
        }
    });

export const appsCommand = new Command("apps")
    .description("Register and manage apps")
    .addCommand(list)
    .addCommand(register)
    .addCommand(status);
