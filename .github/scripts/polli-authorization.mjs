const WRITE_USER_IDS = new Set([5099901, 36901823, 158852059, 74301576]);
const PR_ONLY_USER_IDS = new Set([
    34513273, 204561696, 182555207, 189873015, 228371309,
]);

function validId(value) {
    return (
        typeof value === "number" && Number.isSafeInteger(value) && value > 0
    );
}

function commandIn(value, command) {
    return (
        typeof value === "string" &&
        new RegExp(`(?:^|\\s)${command}(?=\\s|$)`).test(value)
    );
}

function commandTarget(eventName, event, command) {
    if (!event || typeof event !== "object") return null;

    if (eventName === "issue_comment") {
        if (
            !validId(event.issue?.number) ||
            typeof event.comment?.body !== "string"
        )
            return null;
        return {
            command: commandIn(event.comment.body, command),
            isPullRequest: Boolean(event.issue.pull_request),
        };
    }

    if (eventName === "pull_request_review_comment") {
        if (
            !validId(event.pull_request?.number) ||
            typeof event.comment?.body !== "string"
        )
            return null;
        return {
            command: commandIn(event.comment.body, command),
            isPullRequest: true,
        };
    }

    if (eventName === "pull_request_review") {
        if (
            !validId(event.pull_request?.number) ||
            typeof event.review?.body !== "string"
        )
            return null;
        return {
            command: commandIn(event.review.body, command),
            isPullRequest: true,
        };
    }

    if (eventName === "issues") {
        if (
            !["opened", "assigned"].includes(event.action) ||
            !validId(event.issue?.number) ||
            typeof event.issue?.title !== "string" ||
            (event.issue.body !== null && typeof event.issue.body !== "string")
        ) {
            return null;
        }
        return {
            command:
                commandIn(event.issue.title, command) ||
                commandIn(event.issue.body ?? "", command),
            isPullRequest: false,
        };
    }

    return null;
}

export function authorizePolli({
    eventName,
    event,
    actor,
    triggeringActor,
    mode,
}) {
    if (
        !event ||
        typeof event !== "object" ||
        typeof actor !== "string" ||
        actor.length === 0
    )
        return false;
    if (
        triggeringActor !== actor ||
        event.sender?.login !== actor ||
        !validId(event.sender?.id)
    )
        return false;

    const command =
        mode === "write" ? "!polli" : mode === "read" ? "!askpolli" : null;
    if (!command) return false;

    const target = commandTarget(eventName, event, command);
    if (!target?.command) return false;

    if (mode === "write") return WRITE_USER_IDS.has(event.sender.id);
    return (
        WRITE_USER_IDS.has(event.sender.id) ||
        (target.isPullRequest && PR_ONLY_USER_IDS.has(event.sender.id))
    );
}
