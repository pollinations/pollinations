// Every agent the runner wakes: the door that wakes it, the facts it gets, the
// hosted agent and its key, and what it may write. Adding an agent is one
// entry here plus its folder under operations/agents/.
import { appSubmission } from "./facts/app-submission.js";

const BADGE =
    "[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)";

export const ROUTES = [
    {
        id: "community-app/review",
        agent: "community/pollinations-ai/community-app",
        keyEnv: "COMMUNITY_APP_KEY",
        door: {
            event: "issues",
            actions: ["opened", "edited"],
            labels: ["APP-SUBMISSION"],
            titlePrefix: "[App Submission]",
            skipLabels: ["APP-APPROVED"],
        },
        facts: appSubmission,
        requirements: [
            "works",
            "uses_pollinations",
            "credits_pollinations",
            "screenshot_shows_app",
            "not_already_listed",
            "sign_in",
            "quest_fits",
        ],
        optional: ["sign_in", "quest_fits"],
        typeLabel: "APP-SUBMISSION",
        labels: { ready: "APP-REVIEW", needsInfo: "APP-NEEDS-INFO" },
        texts: {
            marker: "<!-- APP_PRE_REVIEW -->",
            readyTitle: "App pre-review: ready for human review",
            needsInfoTitle: "App pre-review: more information needed",
            unavailableTitle: "App pre-review unavailable",
            unavailable:
                "The automated check could not finish. A maintainer will look at it; no submitter action is required yet.",
            readyClosing:
                "A maintainer can verify the app, confirm the badge or pollinations.ai link is visible, and add `APP-APPROVED` to publish it.",
            needsInfoClosing:
                "Edit the issue with the requested information; the pre-review will run again.",
            invalidClosing:
                "Edit the issue with the missing information; the pre-review will run again.",
            snippetFor: "credits_pollinations",
            snippet: `Badge snippet:\n\n\`\`\`markdown\n${BADGE}\n\`\`\``,
            checkNames: {
                works: "Works",
                uses_pollinations: "Uses Pollinations",
                credits_pollinations: "Credits Pollinations",
                screenshot_shows_app: "Screenshot shows the app",
                not_already_listed: "Not already listed",
                sign_in: "Sign-in returns to the app",
                quest_fits: "Quest fits",
            },
        },
    },
];

// Only events from the one repository the runner serves start a run, even if
// the app is installed on others.
export function matchRoute(event, payload, repo) {
    const issue = payload.issue;
    if (payload.repository?.full_name !== repo) return null;
    if (!issue || issue.pull_request || issue.state !== "open") return null;
    const labels = issue.labels.map((l) => l.name);
    return (
        ROUTES.find(
            ({ door }) =>
                event === door.event &&
                door.actions.includes(payload.action) &&
                !labels.some((l) => door.skipLabels.includes(l)) &&
                (labels.some((l) => door.labels.includes(l)) ||
                    issue.title.startsWith(door.titlePrefix)),
        ) ?? null
    );
}
