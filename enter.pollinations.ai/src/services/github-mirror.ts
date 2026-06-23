/**
 * GitHub -> D1 mirror. A thin, full snapshot of the pollinations/pollinations
 * repo's pull requests, issues, and PR->issue "closes" edges, refreshed
 * wholesale on a schedule. Generic and quest-agnostic: it mirrors GitHub state
 * into gh_pull_requests / gh_issues / gh_pr_closing_issues and nothing else.
 *
 * All-GraphQL (measured against the live repo): ~5k PRs over 51 pages + ~6.6k
 * issues over 67 pages + ~1.8k closing edges — ~2 min wall-clock, <2% of the
 * App's 10k pts/hr GraphQL budget. GraphQL (not REST) because:
 *   - the PR->issue close relation (closingIssuesReferences) exists ONLY in
 *     GraphQL — it is on neither the PR nor the issue payload; and
 *   - the GraphQL `issues` connection returns real issues only (the REST
 *     /issues feed mixes in PRs), and is ~2x faster than REST here.
 */

import { getLogger } from "@logtape/logtape";
import * as schema from "@shared/db/better-auth.ts";
import {
    type GithubAppCredentials,
    getInstallationToken,
    githubAppCredentialsFromEnv,
} from "@shared/github/app-auth.ts";
import { graphqlPaginate } from "@shared/github/client.ts";
import { chunkedUpsert } from "@shared/github/upsert.ts";
import { lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const log = getLogger(["enter", "github-mirror"]);

const REPO_OWNER = "pollinations";
const REPO_NAME = "pollinations";

type Db = ReturnType<typeof drizzle<typeof schema>>;

type GraphqlAuthor = { login?: string; databaseId?: number } | null;

// ---- PR + closing-edge mirror (GraphQL) ----

const PR_QUERY = `
query($owner:String!,$name:String!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequests(first:100, after:$cursor, orderBy:{field:CREATED_AT,direction:ASC}){
      pageInfo{ hasNextPage endCursor }
      nodes{
        number state merged mergedAt createdAt closedAt updatedAt title url
        author{ login ... on User { databaseId } }
        closingIssuesReferences(first:100){ nodes{ number } }
      }
    }
  }
}`;

type PrNode = {
    number: number;
    state: string;
    merged: boolean;
    mergedAt: string | null;
    createdAt: string | null;
    closedAt: string | null;
    updatedAt: string | null;
    title: string;
    url: string;
    author: GraphqlAuthor;
    closingIssuesReferences: { nodes: { number: number }[] };
};

type PrData = {
    repository: {
        pullRequests: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: PrNode[];
        };
    };
};

function prRow(
    node: PrNode,
    runStart: Date,
): typeof schema.ghPullRequests.$inferInsert {
    return {
        number: node.number,
        authorGithubId: node.author?.databaseId ?? null,
        authorLogin: node.author?.login ?? null,
        // GraphQL surfaces MERGED as its own state; lower-case for storage.
        state: node.merged ? "merged" : node.state.toLowerCase(),
        mergedAt: node.mergedAt ? new Date(node.mergedAt) : null,
        title: node.title,
        url: node.url,
        githubCreatedAt: node.createdAt ? new Date(node.createdAt) : null,
        githubClosedAt: node.closedAt ? new Date(node.closedAt) : null,
        githubUpdatedAt: node.updatedAt ? new Date(node.updatedAt) : null,
        syncedAt: runStart,
    };
}

async function syncPullRequests(
    db: Db,
    token: string,
    runStart: Date,
): Promise<{ prs: number; edges: number; pages: number }> {
    const prRows: (typeof schema.ghPullRequests.$inferInsert)[] = [];
    const edgeRows: (typeof schema.ghPrClosingIssues.$inferInsert)[] = [];

    const pages = await graphqlPaginate<PrData, PrNode>(
        token,
        PR_QUERY,
        { owner: REPO_OWNER, name: REPO_NAME },
        (data) => data.repository.pullRequests,
        (nodes) => {
            for (const node of nodes) {
                prRows.push(prRow(node, runStart));
                for (const ref of node.closingIssuesReferences.nodes) {
                    edgeRows.push({
                        edgeKey: `${node.number}:${ref.number}`,
                        prNumber: node.number,
                        issueNumber: ref.number,
                        syncedAt: runStart,
                    });
                }
            }
        },
    );

    // Guard against wiping the mirror on an empty-but-"successful" GraphQL
    // response (a 200 with nodes:[] and no errors — e.g. a throttle/abuse path).
    // With zero rows seen, the reap below would delete EVERY live row, since a
    // no-op upsert re-stamps nothing and all rows carry syncedAt < runStart.
    if (prRows.length === 0) {
        log.warn(
            "GITHUB_MIRROR_EMPTY: PR sync returned 0 rows — skipping reap to avoid wiping the mirror",
        );
        return { prs: 0, edges: 0, pages };
    }

    const prs = await chunkedUpsert(db, schema.ghPullRequests, prRows);
    const edges = await chunkedUpsert(db, schema.ghPrClosingIssues, edgeRows);
    // Reap rows not seen this run — PRs deleted on GitHub, and (the important
    // case) closing-issue edges removed from a PR description. A full sweep
    // re-stamps every live row's syncedAt to runStart, so anything older is
    // stale. This runs only after the upserts above succeed.
    await db
        .delete(schema.ghPullRequests)
        .where(lt(schema.ghPullRequests.syncedAt, runStart));
    await db
        .delete(schema.ghPrClosingIssues)
        .where(lt(schema.ghPrClosingIssues.syncedAt, runStart));
    return { prs, edges, pages };
}

// ---- Issue mirror (GraphQL) ----

const ISSUE_QUERY = `
query($owner:String!,$name:String!,$cursor:String){
  repository(owner:$owner,name:$name){
    issues(first:100, after:$cursor, orderBy:{field:CREATED_AT,direction:ASC}){
      pageInfo{ hasNextPage endCursor }
      nodes{
        number state title url body createdAt closedAt updatedAt
        author{ login ... on User { databaseId } }
        assignees(first:10){ nodes{ login databaseId } }
        labels(first:100){ nodes{ name } }
      }
    }
  }
}`;

type IssueNode = {
    number: number;
    state: string;
    title: string;
    url: string;
    body: string | null;
    createdAt: string | null;
    closedAt: string | null;
    updatedAt: string | null;
    author: GraphqlAuthor;
    assignees: { nodes: { login?: string; databaseId?: number }[] };
    labels: { nodes: { name: string }[] };
};

type IssueData = {
    repository: {
        issues: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: IssueNode[];
        };
    };
};

function issueRow(
    node: IssueNode,
    runStart: Date,
): typeof schema.ghIssues.$inferInsert {
    const assignees = node.assignees.nodes;
    const first = assignees[0];
    return {
        number: node.number,
        authorGithubId: node.author?.databaseId ?? null,
        authorLogin: node.author?.login ?? null,
        // GraphQL issue state is OPEN/CLOSED; lower-case to match REST style.
        state: node.state.toLowerCase(),
        title: node.title,
        url: node.url,
        body: node.body ?? null,
        labelsJson: JSON.stringify(node.labels.nodes.map((l) => l.name)),
        // First assignee kept as indexed columns; full list as JSON.
        assigneeGithubId: first?.databaseId ?? null,
        assigneeLogin: first?.login ?? null,
        assigneesJson: JSON.stringify(
            assignees.map((a) => ({
                login: a.login ?? null,
                githubId: a.databaseId ?? null,
            })),
        ),
        githubCreatedAt: node.createdAt ? new Date(node.createdAt) : null,
        githubClosedAt: node.closedAt ? new Date(node.closedAt) : null,
        githubUpdatedAt: node.updatedAt ? new Date(node.updatedAt) : null,
        syncedAt: runStart,
    };
}

async function syncIssues(
    db: Db,
    token: string,
    runStart: Date,
): Promise<{ issues: number; pages: number }> {
    const issueRows: (typeof schema.ghIssues.$inferInsert)[] = [];

    const pages = await graphqlPaginate<IssueData, IssueNode>(
        token,
        ISSUE_QUERY,
        { owner: REPO_OWNER, name: REPO_NAME },
        (data) => data.repository.issues,
        (nodes) => {
            for (const node of nodes) issueRows.push(issueRow(node, runStart));
        },
    );

    // Same empty-response guard as PRs: never reap when zero rows were seen.
    if (issueRows.length === 0) {
        log.warn(
            "GITHUB_MIRROR_EMPTY: issue sync returned 0 rows — skipping reap to avoid wiping the mirror",
        );
        return { issues: 0, pages };
    }

    const issues = await chunkedUpsert(db, schema.ghIssues, issueRows);
    // Reap issues deleted on GitHub (re-stamped live rows have syncedAt=runStart).
    await db
        .delete(schema.ghIssues)
        .where(lt(schema.ghIssues.syncedAt, runStart));
    return { issues, pages };
}

// ---- entry point ----

/**
 * Run a full mirror sync. Fail-soft: logs and returns rather than throwing, so a
 * GitHub hiccup never breaks the scheduled handler's other work.
 */
export async function syncGithubMirror(env: CloudflareBindings): Promise<void> {
    let creds: GithubAppCredentials;
    try {
        creds = githubAppCredentialsFromEnv(env);
    } catch (err) {
        log.warn("GITHUB_MIRROR_SKIPPED: missing app credentials ({error})", {
            error: String(err),
        });
        return;
    }

    const startedAt = Date.now();
    // Single per-run timestamp stamped onto every row, so the post-sweep reap
    // can delete anything still carrying an older syncedAt (rows not seen this
    // run). Must be one shared Date across all rows for the `< runStart`
    // comparison to be exact.
    const runStart = new Date(startedAt);
    try {
        const token = await getInstallationToken(creds, REPO_OWNER);
        const db = drizzle(env.DB, { schema });

        const prResult = await syncPullRequests(db, token, runStart);
        const issueResult = await syncIssues(db, token, runStart);

        log.info(
            "GITHUB_MIRROR_DONE: prs={prs} edges={edges} issues={issues} ({ms}ms)",
            {
                prs: prResult.prs,
                edges: prResult.edges,
                issues: issueResult.issues,
                prPages: prResult.pages,
                issuePages: issueResult.pages,
                ms: Date.now() - startedAt,
                eventType: "github_mirror_done",
            },
        );
    } catch (err) {
        log.error("GITHUB_MIRROR_ERROR: {error}", {
            error: err instanceof Error ? err.message : String(err),
            ms: Date.now() - startedAt,
            eventType: "github_mirror_error",
        });
    }
}
