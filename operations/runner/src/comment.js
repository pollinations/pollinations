// One status comment per issue, written from a route's texts and the checked
// outcome. Every agent-written line arrives already cleaned by the checker.
const STATUS_TEXT = {
    supported: "✅ supported",
    contradicted: "❌ contradicted",
    unverified: "❔ unverified",
    not_applicable: "➖ not applicable",
};

const bullets = (items) => items.map((item) => `- ${item}`).join("\n");

export function renderComment(texts, outcome, author) {
    const mention = /^[A-Za-z0-9-]+$/.test(author ?? "") ? `@${author} ` : "";
    const head = (title) => `${texts.marker}\n## ${title}\n\n${mention}`;
    if (outcome.kind === "unavailable")
        return `${head(texts.unavailableTitle)}${texts.unavailable}`;
    if (outcome.kind === "invalid")
        return `${head(texts.needsInfoTitle)}\n\n${bullets(outcome.errors)}\n\n${texts.invalidClosing}`;
    const { result } = outcome;
    const table = [
        "| Check | Result | Note |",
        "|---|---|---|",
        ...result.findings.map(
            (f) =>
                `| ${texts.checkNames[f.requirement]} | ${STATUS_TEXT[f.status]} | ${f.note} |`,
        ),
    ].join("\n");
    const notChecked = result.couldNotCheck.length
        ? `\n\nCould not check:\n\n${bullets(result.couldNotCheck)}`
        : "";
    if (!result.contradicted)
        return `${head(texts.readyTitle)}\n\n${table}${notChecked}\n\n${texts.readyClosing}`;
    const snippet = result.findings.some(
        (f) =>
            f.requirement === texts.snippetFor && f.status === "contradicted",
    )
        ? `\n\n${texts.snippet}`
        : "";
    return `${head(texts.needsInfoTitle)}\n\n${bullets(result.questions)}${snippet}\n\n${table}${notChecked}\n\n${texts.needsInfoClosing}`;
}
