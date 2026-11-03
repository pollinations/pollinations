// Every agent the runner wakes: the door that wakes it, the facts it gets, the
// hosted agent and its key, and what it may write. Adding an agent is one
// entry here plus its folder under operations/agents/.
import { appSubmission } from "./facts/app-submission.js";

const BADGE =
    "[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)";

export const ROUTES = [
    {
        id: "community-apps/review",
        agent: "community/pollinations-ai/community-apps",
        keyEnv: "COMMUNITY_APPS_KEY",
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
        // The GitHub token's grant: issues on the runner's one repository. The
        // code narrows it further: deliver() writes only this route's marker
        // comment and its own status labels. Publishing stays behind a
        // maintainer's APP-APPROVED and the existing publish workflow.
        permissions: { issues: "write" },
        typeLabel: "APP-SUBMISSION",
        labels: { ready: "APP-REVIEW", needsInfo: "APP-NEEDS-INFO" },
        texts: {
            marker: "<!-- APP_PRE_REVIEW -->",
            readyTitle: "App pre-review: ready for human review",
            incompleteTitle: "App pre-review: not enough could be checked",
            incompleteClosing:
                "The automated check could not confirm or rule out anything, so a maintainer will review it by hand.",
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

// Whether a route may act on an issue as it stands now: checked when the
// event arrives and again right before writing.
export function eligible(route, issue) {
    if (!issue || issue.pull_request || issue.state !== "open") return false;
    const labels = issue.labels.map((l) => l.name);
    const { door } = route;
    return (
        !labels.some((l) => door.skipLabels.includes(l)) &&
        (labels.some((l) => door.labels.includes(l)) ||
            issue.title.startsWith(door.titlePrefix))
    );
}

// Only events from the one repository the runner serves start a run, even if
// the app is installed on others.
export function matchRoute(event, payload, repo) {
    if (payload.repository?.full_name !== repo) return null;
    return (
        ROUTES.find(
            (route) =>
                event === route.door.event &&
                route.door.actions.includes(payload.action) &&
                eligible(route, payload.issue),
        ) ?? null
    );
}
