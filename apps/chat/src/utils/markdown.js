import hljs from "highlight.js";
import katex from "katex";
import renderMathInElement from "katex/contrib/auto-render";
import MarkdownIt from "markdown-it";
import markdownitHighlightjs from "markdown-it-highlightjs";
import { marked } from "marked";

const escapeHtml = (value) =>
    String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

const URL_ATTRIBUTE_PATTERN =
    /\s(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

const decodeHtmlEntities = (value) =>
    String(value).replace(
        /&(#x?[0-9a-f]+|amp|quot|apos|lt|gt);/gi,
        (match, entity) => {
            const lower = entity.toLowerCase();
            if (lower === "amp") return "&";
            if (lower === "quot") return '"';
            if (lower === "apos") return "'";
            if (lower === "lt") return "<";
            if (lower === "gt") return ">";
            if (lower.startsWith("#x")) {
                return String.fromCodePoint(
                    Number.parseInt(lower.slice(2), 16),
                );
            }
            if (lower.startsWith("#")) {
                return String.fromCodePoint(
                    Number.parseInt(lower.slice(1), 10),
                );
            }
            return match;
        },
    );

const stripUrlControlChars = (value) =>
    Array.from(value)
        .filter((char) => {
            const code = char.codePointAt(0) ?? 0;
            return code > 0x20 && code !== 0x7f;
        })
        .join("");

const isSafeUrl = (value, attributeName) => {
    const normalized = stripUrlControlChars(decodeHtmlEntities(value).trim());

    if (!normalized) return true;
    if (normalized.startsWith("#")) return true;
    if (normalized.startsWith("/") && !normalized.startsWith("//")) return true;
    if (normalized.startsWith("./") || normalized.startsWith("../"))
        return true;

    try {
        const parsed = new URL(normalized, "https://pollinations.ai");
        if (["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
            return true;
        }
        return (
            attributeName.toLowerCase() === "src" &&
            parsed.protocol === "data:" &&
            /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,/i.test(normalized)
        );
    } catch {
        return false;
    }
};

const sanitizeRenderedHtml = (html) =>
    String(html).replace(
        URL_ATTRIBUTE_PATTERN,
        (match, attributeName, doubleQuoted, singleQuoted, unquoted) => {
            const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
            if (isSafeUrl(value, attributeName)) return match;
            return ` ${attributeName.toLowerCase()}="#"`;
        },
    );

marked.setOptions({
    gfm: true,
    breaks: false,
    mangle: false,
    headerIds: false,
    highlight(code, language) {
        if (language && hljs.getLanguage(language)) {
            try {
                return hljs.highlight(code, { language, ignoreIllegals: true })
                    .value;
            } catch (error) {
                console.warn("Highlight error (marked):", error);
            }
        }
        return escapeHtml(code);
    },
});

marked.use({
    tokenizer: {
        html(src) {
            const match = src.match(/^<[^>]*>/);
            if (match) {
                const raw = match[0];
                return {
                    type: "text",
                    raw,
                    text: escapeHtml(raw),
                };
            }
            return undefined;
        },
    },
});

const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight: (str, lang) => {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return (
                    '<pre class="code-block"><code class="hljs language-' +
                    lang +
                    '">' +
                    hljs.highlight(str, {
                        language: lang,
                        ignoreIllegals: true,
                    }).value +
                    "</code></pre>"
                );
            } catch (error) {
                console.warn("Highlight error (markdown-it):", error);
            }
        }
        return `<pre class="code-block"><code class="hljs">${escapeHtml(str)}</code></pre>`;
    },
}).use(markdownitHighlightjs);

const renderMath = (html) => {
    if (typeof document === "undefined") {
        return html;
    }

    const div = document.createElement("div");
    div.innerHTML = html;

    try {
        renderMathInElement(div, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\[", right: "\\]", display: true },
                { left: "\\(", right: "\\)", display: false },
            ],
            throwOnError: false,
            katex,
        });
    } catch (error) {
        console.error("KaTeX rendering error:", error);
    }

    return div.innerHTML;
};

export const formatMessage = (content) => {
    if (!content) return "";

    try {
        let textContent = String(content);

        textContent = textContent.trim();

        textContent = textContent.replace(/\n{3,}/g, "\n\n");

        textContent = textContent.replace(
            /([^`\n])([ ]{2,})([^`\n])/g,
            "$1 $3",
        );

        const chartRegex = /__CHART__(.*?)__CHART__/g;
        const charts = [];
        for (const match of textContent.matchAll(chartRegex)) {
            try {
                charts.push(JSON.parse(match[1]));
            } catch (e) {
                console.error("Failed to parse chart data:", e);
            }
        }

        textContent = textContent.replace(chartRegex, "");

        let html = md.render(textContent);

        html = sanitizeRenderedHtml(renderMath(html));

        if (charts.length > 0) {
            html += `<div data-charts='${JSON.stringify(charts).replace(/'/g, "&apos;")}'></div>`;
        }

        return html;
    } catch (error) {
        console.error("Markdown rendering error:", error);
        return escapeHtml(String(content));
    }
};

export const formatStreamingMessage = (content) => {
    if (!content) return "";

    try {
        let textContent = String(content || "");

        textContent = textContent.trim();

        textContent = textContent.replace(/\n{3,}/g, "\n\n");

        textContent = textContent.replace(
            /([^`\n])([ ]{2,})([^`\n])/g,
            "$1 $3",
        );

        const html = marked.parse(textContent, { async: false });
        return sanitizeRenderedHtml(renderMath(html));
    } catch (error) {
        console.error("Streaming markdown rendering error:", error);
        return escapeHtml(String(content));
    }
};
