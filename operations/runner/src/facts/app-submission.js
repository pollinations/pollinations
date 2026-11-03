// Facts for an app submission issue. The shared form rules run first; a form
// they reject stops the run before any agent call. Otherwise the agent gets
// the page, the repository, the quest and the related catalog apps.
import {
    parseSubmission,
    submissionErrors,
} from "../../../app-management/submissions/submission.js";
import { redact } from "../checker.js";
import { catalog, relatedApps } from "./catalog.js";
import { pageFacts } from "./page.js";

// The submitter names the repository, and the bot's token can see private
// repositories it is installed on, so only a public one is ever read.
export async function repoFact(repoUrl, github, nextId) {
    const parts = new URL(repoUrl).pathname.split("/").filter(Boolean);
    const name = `${parts[0]}/${parts[1]?.replace(/\.git$/, "")}`;
    const folder = parts[2] === "tree" ? parts.slice(4).join("/") : "";
    try {
        const { private: hidden, default_branch: branch } =
            await github.repo(name);
        if (hidden !== false) throw new Error("not a public repository");
        const { tree } = await github.tree(name, branch);
        const files = tree
            .filter((f) => f.type === "blob" && f.path.startsWith(folder))
            .map((f) => f.path)
            .filter((path) => !path.includes("node_modules/"))
            .slice(0, 150);
        return {
            id: nextId(),
            kind: "repo",
            repo: name,
            raw: `https://raw.githubusercontent.com/${name}/${branch}/`,
            folder,
            files,
        };
    } catch (error) {
        return {
            id: nextId(),
            kind: "repo",
            url: repoUrl,
            error: error.message,
        };
    }
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const SCREENSHOT_RULES = "PNG, JPEG, or WebP, at most 5 MB";

// The screenshot judged by its size and first bytes: a Worker has no image
// decoder, and publishing decodes it fully before it is listed. Only a missing
// file (404, 410) is the submitter's error; anything else, a rate limit
// included, is retried.
export async function screenshotErrors(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (res.status === 404 || res.status === 410)
        return [
            "Screenshot could not be downloaded; upload it again in the Screenshot field.",
        ];
    if (!res.ok) throw new Error(`screenshot -> ${res.status}`);
    const tooBig = (bytes) => [
        `Screenshot is ${(bytes / 1024 / 1024).toFixed(1)} MB; it must be ${SCREENSHOT_RULES}.`,
    ];
    const declared = Number(res.headers.get("content-length"));
    if (declared > MAX_SCREENSHOT_BYTES) {
        res.body?.cancel();
        return tooBig(declared);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_SCREENSHOT_BYTES) return tooBig(bytes.length);
    const head = String.fromCharCode(...bytes.subarray(0, 12));
    const image =
        head.startsWith("\x89PNG\r\n\x1a\n") ||
        head.startsWith("\xff\xd8\xff") ||
        (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP");
    return image
        ? []
        : [
              `Screenshot is not a PNG, JPEG or WebP image; it must be ${SCREENSHOT_RULES}.`,
          ];
}

export async function appSubmission({ issue, github, repo }) {
    const submission = parseSubmission(issue.body);
    // Only a quest that doesn't exist (404, 410) is the submitter's error.
    const quest = /^\d+$/.test(submission.quest)
        ? await github.issue(submission.quest).catch((error) => {
              if (error.status === 404 || error.status === 410) return null;
              throw error;
          })
        : null;
    const questOpen =
        quest?.state === "open" &&
        quest.labels.some((l) => l.name === "POLLEN-QUEST");
    const [author, apps, open] = await Promise.all([
        github.user(issue.user.login),
        catalog(repo),
        github.openIssues("APP-SUBMISSION"),
    ]);
    const errors = submissionErrors({
        submission,
        issueNumber: issue.number,
        author: { id: author.id, nodeId: author.node_id },
        apps,
        openSubmissions: open.map((candidate) => ({
            number: candidate.number,
            body: candidate.body,
            url: candidate.html_url,
            authorNodeId: candidate.user?.node_id,
        })),
        questOpen,
        screenshot: submission.screenshotUrl
            ? await screenshotErrors(submission.screenshotUrl)
            : [],
    });
    if (errors.length) return { stop: errors };

    let n = 0;
    const nextId = () => `F${++n}`;
    const facts = [];
    if (submission.appUrl)
        facts.push(...(await pageFacts(submission.appUrl, nextId)));
    if (submission.repoUrl)
        facts.push(await repoFact(submission.repoUrl, github, nextId));
    if (quest)
        facts.push({
            id: nextId(),
            kind: "quest",
            number: submission.quest,
            state: quest.state,
            isQuest: quest.labels.some((l) => l.name === "POLLEN-QUEST"),
            title: quest.title,
            body: redact(quest.body).slice(0, 1500),
        });
    const related = relatedApps(submission, apps);
    return {
        context: {
            job: "submission",
            app: {
                name: redact(submission.name),
                description: redact(submission.description),
                appUrl: submission.appUrl,
                repoUrl: submission.repoUrl,
                category: submission.category,
                platform: submission.platform,
                quest: submission.quest || null,
                submittedDate: issue.created_at.slice(0, 10),
            },
            facts,
            related,
        },
        image: submission.screenshotUrl || null,
        // A fact whose fetch failed explains what couldn't be checked; it is
        // never evidence.
        ids: new Set(
            [...facts.filter((f) => !f.error), ...related].map((f) => f.id),
        ),
    };
}
