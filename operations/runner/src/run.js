// One review of one issue, then its delivery. review() reads the issue as it
// is now, gathers facts, asks the agent and checks the answer; deliver() writes
// the result, unless the issue moved on in the meantime.
import { askAgent } from "./agent.js";
import { checkReport, parseReport } from "./checker.js";
import { renderComment } from "./comment.js";
import { eligible } from "./routes.js";

export async function review({
    route,
    rulebook,
    number,
    repo,
    github,
    key,
    lastAttempt = true,
    ask = askAgent,
    log = console.log,
}) {
    const issue = await github.issue(number);
    if (!eligible(route, issue)) return { skip: true };
    let outcome;
    try {
        const gathered = await route.facts({ issue, github, repo });
        if (gathered.stop) outcome = { kind: "invalid", errors: gathered.stop };
        else {
            const answer = await ask({
                model: route.agent,
                rulebook,
                context: gathered.context,
                image: gathered.image,
                key,
            });
            outcome = {
                kind: "report",
                result: checkReport(parseReport(answer.text), {
                    ids: gathered.ids,
                    fetched: answer.fetched,
                    requirements: route.requirements,
                    optional: route.optional,
                }),
                usage: answer.usage,
            };
        }
    } catch (error) {
        outcome = { kind: "unavailable", error: error.message };
    }
    // A report that confirms or rules out nothing goes to a person as
    // incomplete; "ready for human review" never stands for "passed".
    if (
        outcome.kind === "report" &&
        !outcome.result.findings.some(
            (f) => f.status === "supported" || f.status === "contradicted",
        )
    )
        outcome.kind = "incomplete";
    // A failed attempt that will be retried writes nothing.
    if (outcome.kind === "unavailable" && !lastAttempt) {
        log(
            JSON.stringify({
                route: route.id,
                issue: number,
                outcome: "retry",
                error: outcome.error,
            }),
        );
        return { retry: true, error: outcome.error };
    }
    const label =
        outcome.kind === "unavailable"
            ? null
            : outcome.kind === "invalid" || outcome.result.contradicted
              ? route.labels.needsInfo
              : route.labels.ready;
    const body = renderComment(route.texts, outcome, issue.user?.login);
    log(
        JSON.stringify({
            route: route.id,
            issue: number,
            outcome: outcome.kind,
            label,
            error: outcome.error,
            usage: outcome.usage,
            // Kept for inspection: what each claim cited.
            evidence: outcome.result?.findings.map((f) => ({
                [f.requirement]: f.status,
                cited: f.evidence,
            })),
            body,
        }),
    );
    return { issueBody: issue.body, label, body };
}

export async function deliver({
    route,
    number,
    github,
    result,
    isLatest = async () => true,
    log = console.log,
}) {
    // Look up our comment first, so the freshness check sits right before the
    // writes. GitHub has no conditional write, so the writes are checked again
    // after they land.
    const comment = await github.markerComment(number, route.texts.marker);
    const fresh = await github.issue(number);
    if (
        !(await isLatest()) ||
        fresh.body !== result.issueBody ||
        !eligible(route, fresh)
    ) {
        log(`issue ${number} changed before writing; nothing written`);
        return { skipped: true };
    }
    // Old status off first: a failure part-way leaves no label rather than an
    // old label beside a new comment, and the retry finishes the job.
    await github.removeLabels(number, Object.values(route.labels));
    const saved = await github.saveComment(number, comment, result.body);
    await github.addLabels(
        number,
        [route.typeLabel, result.label].filter(Boolean),
    );
    // Closed or approved while we wrote: take our status back off and say so.
    // If this cleanup fails, its retry sees the closed issue and stops.
    if (!eligible(route, await github.issue(number))) {
        await github.removeLabels(number, Object.values(route.labels));
        await github.saveComment(
            number,
            saved,
            `${route.texts.marker}\n${route.texts.superseded}`,
        );
        log(`issue ${number} closed or approved during the writes; undone`);
        return { superseded: true };
    }
    return { written: true };
}
