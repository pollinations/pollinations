import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../../../../", import.meta.url);
const palette = JSON.parse(
    readFileSync(new URL("packages/ui/src/theme-palette.json", root), "utf8"),
);
const template = readFileSync(
    new URL("../assets/email.html", import.meta.url),
    "utf8",
);
const logo =
    "https://raw.githubusercontent.com/pollinations/pollinations/7851d688a1ef4c680d437b3b93f4a35c596d2a0e/packages/ui/src/brand/lockup-horizontal-black.png";
const branding = `<br><div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.5"><a href="https://pollinations.ai"><img src="${logo}" width="144" height="18" alt="Pollinations.ai" style="display:block;border:0"></a></div>`;
const escapeHtml = (text) =>
    text.replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c],
    );

function requireText(value, name) {
    if (typeof value !== "string" || !value.trim())
        throw new Error(`${name} must be nonempty text`);
}

function validate(message, technical, documentationGap) {
    for (const field of ["language", "title", "closing"])
        requireText(message[field], field);
    if (!Array.isArray(message.blocks) || !message.blocks.length)
        throw new Error("blocks are required");
    for (const block of message.blocks) {
        if (block.type === "list") {
            if (!Array.isArray(block.items) || !block.items.length)
                throw new Error("list items are required");
            for (const item of block.items) requireText(item, "list item");
            if (
                block.ordered !== undefined &&
                typeof block.ordered !== "boolean"
            )
                throw new Error("list ordered must be boolean");
            continue;
        }
        if (block.type === "table") {
            if (
                !Array.isArray(block.headers) ||
                !block.headers.length ||
                !Array.isArray(block.rows) ||
                !block.rows.length
            )
                throw new Error("table headers and rows are required");
            for (const cell of block.headers) requireText(cell, "table header");
            for (const row of block.rows) {
                if (!Array.isArray(row) || row.length !== block.headers.length)
                    throw new Error("table row must match headers");
                for (const cell of row) requireText(cell, "table cell");
            }
            continue;
        }
        if (!["paragraph", "heading", "code", "callout"].includes(block.type))
            throw new Error("Unknown block type");
        requireText(block.text, "block.text");
    }
    if (!Array.isArray(message.docs)) throw new Error("docs must be an array");
    for (const doc of message.docs) {
        requireText(doc.label, "doc.label");
        const url = new URL(doc.url);
        if (url.protocol !== "https:" || url.username || url.password)
            throw new Error(
                "Documentation requires HTTPS URLs without credentials",
            );
    }
    if (technical && !message.docs.length)
        requireText(
            documentationGap,
            "Technical email needs docs or documentationGap",
        );
}

function renderMessage(message, sender, footerDelivery) {
    const parts = message.blocks.map(
        ({ type, text, items, ordered, headers, rows }) => {
            if (type === "list") {
                const tag = ordered ? "ol" : "ul";
                return `<${tag} style="margin:12px 0;padding-left:24px;">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
            }
            if (type === "table") {
                const cells = (row, tag) =>
                    row
                        .map(
                            (cell) =>
                                `<${tag} style="text-align:left;vertical-align:top;padding:8px;border:1px solid #dadce0;overflow-wrap:anywhere;">${escapeHtml(cell)}</${tag}>`,
                        )
                        .join("");
                return `<table style="width:100%;table-layout:fixed;border-collapse:collapse;margin:12px 0;font:inherit;"><thead><tr>${cells(headers, "th")}</tr></thead><tbody>${rows.map((row) => `<tr>${cells(row, "td")}</tr>`).join("")}</tbody></table>`;
            }
            const body = escapeHtml(text);
            if (type === "callout")
                return `<div style="border-left:3px solid #dadce0;padding:8px 12px;margin:12px 0;">${body.replaceAll("\n", "<br>")}</div>`;
            if (type === "heading")
                return `<h2 style="font-size:14px;margin:20px 0 8px;">${body}</h2>`;
            if (type === "code")
                return `<pre style="margin:12px 0;font:13px/1.6 Menlo,Consolas,monospace;white-space:pre;overflow-x:auto;">${body}</pre>`;
            return `<p style="margin:0 0 12px;">${body.replaceAll("\n", "<br>")}</p>`;
        },
    );
    const docs = message.docs
        .map(
            ({ label, url }) =>
                `<a href="${escapeHtml(url)}" style="color:${palette.brandDark};text-decoration:underline;">${escapeHtml(label)}</a>`,
        )
        .join("<br>");
    const fields = {
        language: escapeHtml(message.language),
        title: escapeHtml(message.title),
        closing: escapeHtml(message.closing),
        sender: escapeHtml(sender),
        branding: footerDelivery === "inline" ? branding : "",
        content: parts.join("\n"),
        docs: docs ? `<p style="margin:12px 0;">${docs}</p>` : "",
    };
    const html = template.replace(/\{\{(\w+)\}\}/g, (_, key) => fields[key]);
    const text = [
        ...message.blocks.map((b) => {
            if (b.type === "list")
                return b.items
                    .map(
                        (item, i) => `${b.ordered ? `${i + 1}.` : "-"} ${item}`,
                    )
                    .join("\n");
            if (b.type === "table")
                return [b.headers, ...b.rows]
                    .map((row) => row.join(" | "))
                    .join("\n");
            return b.text;
        }),
        ...message.docs.map((d) => `${d.label}: ${d.url}`),
        `${message.closing}\n${sender}${footerDelivery === "inline" ? "\nPollinations.ai\nhttps://pollinations.ai" : ""}`,
    ]
        .concat("")
        .join("\n\n");
    return { html, text };
}

export function render(input) {
    requireText(input.sender, "sender");
    const footerDelivery = input.footerDelivery;
    if (!["inline", "workspace"].includes(footerDelivery))
        throw new Error("footerDelivery must be inline or workspace");
    for (const field of ["from", "to", "subject"]) {
        requireText(input.envelope?.[field], `envelope.${field}`);
    }
    if (typeof input.technical !== "boolean")
        throw new Error("technical must be true or false");
    validate(input.message, input.technical, input.documentationGap);
    const isEnglish = /^en(?:-|$)/i.test(input.message.language);
    if (!isEnglish && !input.english)
        throw new Error("A complete English translation is required");
    if (input.english) {
        validate(input.english, input.technical, input.documentationGap);
        if (!/^en(?:-|$)/i.test(input.english.language))
            throw new Error("English translation must use language en");
        const commands = (m) =>
            JSON.stringify(
                m.blocks.filter((b) => b.type === "code").map((b) => b.text),
            );
        const links = (m) => JSON.stringify(m.docs.map((d) => d.url));
        if (
            commands(input.message) !== commands(input.english) ||
            links(input.message) !== links(input.english)
        ) {
            throw new Error(
                "Translation must preserve code blocks and documentation URLs",
            );
        }
    }
    const email = renderMessage(input.message, input.sender, footerDelivery);
    const english = input.english
        ? renderMessage(input.english, input.sender, footerDelivery)
        : null;
    const versions = [email, ...(english ? [english] : [])];
    const frames = versions
        .map(
            (v, i) =>
                `<iframe title="${i ? "English translation" : "Recipient email"}" id="v${i}" ${i ? "hidden" : ""} onload="fit(this)" srcdoc="${escapeHtml(v.html)}"></iframe>`,
        )
        .join("");
    const controls = `<button role="tab" aria-selected="true" onclick="show(0)">${escapeHtml(input.message.language)} · Recipient copy</button>${english ? '<button role="tab" aria-selected="false" onclick="show(1)">English · Review only</button>' : ""}`;
    const envelope = Object.entries(input.envelope)
        .filter(([key]) => ["from", "to", "subject"].includes(key))
        .map(
            ([key, value]) =>
                `<div><strong>${key}:</strong> ${escapeHtml(value)}</div>`,
        )
        .join("");
    const footerPreview =
        footerDelivery === "workspace"
            ? `<p>Exact submitted body above. Google Workspace adds the following footer on delivery; it is excluded from the submitted HTML and plain text.</p>${branding}`
            : "";
    const preview = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pollinations · Email review</title><style>
body{margin:0;background:${palette.bgPale.accent};color:${palette.brandDark};font:14px/1.6 Arial,sans-serif}main{max-width:640px;margin:26px auto;padding:0 12px}h1{font-size:22px;margin:0 0 14px}button{font:inherit;padding:8px 14px;border:1px solid ${palette.brandDark};background:transparent;border-radius:6px;cursor:pointer;margin:0 6px 6px 0}button[aria-selected=true]{background:${palette.brandDark};color:${palette.bgPale.neutral}}p{font-size:12px}iframe{width:100%;border:0;display:block;background:${palette.bgPale.neutral};margin-top:18px}iframe[hidden]{display:none}
</style></head><body><main><h1>Pollinations · Email review</h1><div role="tablist">${controls}</div><p>Not sent · Review the recipient copy before approval. The English translation is for review only.</p><div style="font-size:12px;overflow-wrap:anywhere;">${envelope}</div>${frames}${footerPreview}</main><script>
function fit(frame){if(!frame.hidden)frame.style.height=frame.contentDocument.documentElement.scrollHeight+'px'}function show(index){document.querySelectorAll('iframe').forEach((f,i)=>{f.hidden=i!==index;fit(f)});document.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)))}addEventListener('resize',()=>document.querySelectorAll('iframe').forEach(fit));
</script></body></html>`;
    return { email, english, preview };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    const [source, destination] = process.argv.slice(2);
    if (!source || !destination)
        throw new Error("Usage: node render.mjs message.json output-directory");
    const result = render(JSON.parse(readFileSync(source, "utf8")));
    mkdirSync(destination, { recursive: true });
    for (const [name, value] of [
        ["email", result.email],
        ["english", result.english],
    ]) {
        if (!value) continue;
        writeFileSync(resolve(destination, `${name}.html`), value.html);
        writeFileSync(resolve(destination, `${name}.txt`), value.text);
    }
    writeFileSync(resolve(destination, "preview.html"), result.preview);
    console.log(
        fileURLToPath(pathToFileURL(resolve(destination, "preview.html"))),
    );
}
