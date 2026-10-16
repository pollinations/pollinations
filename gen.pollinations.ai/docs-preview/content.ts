import { readFileSync } from "node:fs";

export type GuideSection = { id: string; title: string; body: string };

// Headings and callouts in the GitHub sources open with emoji; the site
// marks sections with its own icons instead.
const LEADING_EMOJI =
    /^(\s*(?:#{1,6}\s+)?)(?:\p{Extended_Pictographic}️?\s*)+/gmu;

export function slug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "-");
}

/** Rewrites the GitHub-only HTML the renderer does not parse. */
function siteMarkdown(markdown: string): string {
    return markdown
        .replace(LEADING_EMOJI, "$1")
        .replace(/<p[^>]*>\s*(<img[^>]*>)\s*<\/p>/g, "$1")
        .replace(/<img\s[^>]*>/g, (tag) => {
            const attribute = (name: string) =>
                tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
            return `![${attribute("alt")}](${attribute("src")})`;
        })
        .replace(/<\/?sub>/g, "");
}

/** Splits at `## ` headings outside fenced code. */
function splitSections(markdown: string) {
    const sections = [{ title: "", lines: [] as string[] }];
    let fenced = false;
    for (const line of markdown.split("\n")) {
        if (line.startsWith("```")) fenced = !fenced;
        if (!fenced && line.startsWith("## ")) {
            sections.push({ title: line.slice(3).trim(), lines: [] });
        } else {
            sections[sections.length - 1].lines.push(line);
        }
    }
    return sections.map(({ title, lines }) => ({
        title,
        body: lines.join("\n").trim(),
    }));
}

export function loadGuide(path: string) {
    const markdown = readFileSync(path, "utf8");
    const [head, ...sections] = splitSections(siteMarkdown(markdown));
    const title = head.body.match(/^# (.+)$/m)?.[1]?.trim();
    if (!title) throw new Error(`${path} has no title`);
    return {
        title,
        intro: head.body.replace(/^# .+$/m, "").trim(),
        sections: sections.map((section) => ({
            id: slug(section.title),
            ...section,
        })),
        markdown,
    };
}

export type Parameter = {
    name: string;
    type: string;
    required: boolean;
    description: string;
};

/** Reads the reference's body table into rows a narrow column can show. */
function parseDetails(details: string) {
    const lines = details.split("\n");
    const bodyLine = lines.findIndex((line) =>
        line.startsWith("**Request body**"),
    );
    const responseLine = lines.findIndex((line) =>
        line.startsWith("**Response**"),
    );
    const parameters: Parameter[] = [];
    if (bodyLine >= 0) {
        for (const line of lines.slice(bodyLine + 1)) {
            if (!line.startsWith("|")) {
                if (parameters.length) break;
                continue;
            }
            const [name, type, description] = line
                .split(/(?<!\\)\|/)
                .slice(1, -1)
                .map((cell) => cell.trim().replace(/\\\|/g, "|"));
            const field = name.match(/^`([^`]+)`/)?.[1];
            // Skips the header and separator rows, which hold no code name.
            if (!field) continue;
            parameters.push({
                name: field,
                type,
                required: /\*\s*$/.test(name),
                description: description === "—" ? "" : description,
            });
        }
    }
    const end = [bodyLine, responseLine].filter((index) => index >= 0);
    return {
        description: lines
            .slice(0, end.length ? Math.min(...end) : undefined)
            .join("\n")
            .trim(),
        bodyType: lines[bodyLine]?.match(/`([^`]+)`/)?.[1],
        parameters,
        response: lines[responseLine]?.replace(/^\*\*Response\*\*\s*·\s*/, ""),
    };
}

export function loadOperation(path: string, method: string, route: string) {
    const heading = `#### \`${method}\` \`${route}\``;
    const markdown = readFileSync(path, "utf8")
        .split("\n---\n")
        .find((section) => section.trimStart().startsWith(heading))
        ?.trim();
    if (!markdown)
        throw new Error(`${method} ${route} is missing from ${path}`);
    const summary = markdown.match(/^#### .+ — (.+)$/m)?.[1]?.trim() ?? route;
    const [details, examples = ""] = markdown
        .replace(/^#### .+$/m, "")
        .split(/^💻 \*\*Example\*\*$/m);
    const [request, response] = [
        ...examples.matchAll(/```\w*\n([\s\S]*?)\n```/g),
    ].map((match) => match[1]);
    if (!request) throw new Error(`${method} ${route} has no request example`);
    return {
        method,
        path: route,
        summary,
        ...parseDetails(
            // One operation is shown, so schema links open the full reference.
            siteMarkdown(details.trim()).replace(
                /\]\(#([^)]+)\)/g,
                "](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md#$1)",
            ),
        ),
        request,
        responseExample: response ?? "",
        markdown,
    };
}

export type DocsContent = {
    guide: ReturnType<typeof loadGuide>;
    operation: ReturnType<typeof loadOperation>;
};
