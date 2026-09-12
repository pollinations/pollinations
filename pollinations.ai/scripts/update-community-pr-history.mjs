import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "pollinations/pollinations";
const historyStartDay = "2025-01-01";
const query = `
    query($endCursor: String) {
        repository(owner: "pollinations", name: "pollinations") {
            pullRequests(
                first: 100
                after: $endCursor
                states: MERGED
                orderBy: { field: CREATED_AT, direction: ASC }
            ) {
                nodes {
                    number
                    mergedAt
                    title
                    url
                    author {
                        login
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    }
`;
const pages = JSON.parse(
    execFileSync(
        "gh",
        ["api", "graphql", "--paginate", "--slurp", "-f", `query=${query}`],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    ),
);

const pullRequests = pages
    .flatMap((page) => page.data.repository.pullRequests.nodes)
    .map((pullRequest) => ({
        number: pullRequest.number,
        mergedAt: pullRequest.mergedAt,
        title: pullRequest.title,
        url: pullRequest.url,
        author: pullRequest.author?.login ?? "community contributor",
    }))
    .sort((left, right) => left.mergedAt.localeCompare(right.mergedAt));

const diaryPullRequests = pullRequests
    .filter(
        (pullRequest) => pullRequest.mergedAt.slice(0, 10) >= historyStartDay,
    )
    .map(({ number, mergedAt, title, author }) => ({
        number,
        date: mergedAt.slice(0, 10),
        title,
        author,
    }));

const output = resolve(
    process.env.PR_HISTORY_OUTPUT ||
        resolve(
            dirname(fileURLToPath(import.meta.url)),
            "../public/data/community-pr-history.json",
        ),
);
mkdirSync(dirname(output), { recursive: true });
const archive = `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    allTimeCount: pullRequests.length,
    pullRequests: diaryPullRequests,
})}\n`;
writeFileSync(output, archive);

// Publish the data file only; this never generates summaries or social posts.
if (process.argv.includes("--publish-news")) {
    const endpoint = `repos/${repository}/contents/operations/social/news/community-pr-history.json`;
    let sha;
    try {
        sha = execFileSync(
            "gh",
            ["api", `${endpoint}?ref=news`, "--jq", ".sha"],
            {
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
            },
        ).trim();
    } catch (error) {
        if (!String(error.stderr).includes("HTTP 404")) throw error;
    }
    execFileSync("gh", ["api", "--method", "PUT", endpoint, "--input", "-"], {
        input: JSON.stringify({
            message: "news: refresh community PR history",
            content: Buffer.from(archive).toString("base64"),
            branch: "news",
            ...(sha ? { sha } : {}),
        }),
        stdio: ["pipe", "pipe", "pipe"],
    });
}

console.log(
    `Saved ${diaryPullRequests.length} diary pull requests and an all-time total of ${pullRequests.length} from ${repository}.`,
);
