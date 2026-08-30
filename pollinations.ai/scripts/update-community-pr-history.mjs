import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "pollinations/pollinations";
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

const output = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../public/data/community-pr-history.json",
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
    output,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), pullRequests })}\n`,
);

console.log(
    `Saved ${pullRequests.length} merged pull requests from ${repository}.`,
);
