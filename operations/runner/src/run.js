// One run of one route on one issue: facts, the agent, the checker, then the
// route's writes. With write off it only logs what it would post.
import { askAgent } from "./agent.js";
import { checkReport, parseReport } from "./checker.js";
import { renderComment } from "./comment.js";

export async function run({
    route,
    rulebook,
    issue,
    repo,
    github,
    key,
    write,
    isLatest = () => true,
    ask = askAgent,
    log = console.log,
}) {
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
            issue: issue.number,
            write,
            outcome: outcome.kind,
            label,
            error: outcome.error,
            usage: outcome.usage,
            ...(!write && { body }),
        }),
    );
    if (!write) return { outcome, label, body };
    // A newer event, an edit or an approval since this run started wins.
    const fresh = await github.issue(issue.number);
    if (
        !isLatest() ||
        fresh.body !== issue.body ||
        fresh.labels.some((l) => route.door.skipLabels.includes(l.name))
    ) {
        log(`issue ${issue.number} changed during the run; nothing written`);
        return { outcome, label, body, skipped: true };
    }
    await github.upsertComment(issue.number, route.texts.marker, body);
    await github.setStatusLabel(issue.number, Object.values(route.labels), [
        route.typeLabel,
        label,
    ]);
    return { outcome, label, body };
}
