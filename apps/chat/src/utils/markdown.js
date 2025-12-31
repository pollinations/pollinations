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
    html: false, // Disable HTML for security
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
            } catch (__) {}
        }
        return `<pre class="code-block"><code class="hljs">${escapeHtml(str)}</code></pre>`;
    },
}).use(markdownitHighlightjs);

// Function to render LaTeX math equations
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
        // Ensure content is a string
        let textContent = String(content);

        // Trim leading/trailing whitespace to avoid large gaps when rendering
        textContent = textContent.trim();

        // Collapse excessive vertical whitespace (3+ newlines -> 2 newlines)
        textContent = textContent.replace(/\n{3,}/g, "\n\n");

        // Preserve leading spaces for proper formatting

        // Remove multiple consecutive spaces (but not in code blocks or inline code)
        textContent = textContent.replace(
            /([^`\n])([ ]{2,})([^`\n])/g,
            "$1 $3",
        );

        // Extract chart markers before rendering markdown
        const chartRegex = /__CHART__(.*?)__CHART__/g;
        const charts = [];
        let match;
        while ((match = chartRegex.exec(textContent)) !== null) {
            try {
                charts.push(JSON.parse(match[1]));
            } catch (e) {
                console.error("Failed to parse chart data:", e);
            }
        }

        // Remove chart markers from text
        textContent = textContent.replace(chartRegex, "");

        // First, render markdown
        let html = md.render(textContent);

        // Then, render LaTeX math equations
        html = renderMath(html);

        // Append chart data for component to render
        if (charts.length > 0) {
            html += `<div data-charts='${JSON.stringify(charts).replace(/'/g, "&apos;")}'></div>`;
        }

        return html;
    } catch (error) {
        console.error("Markdown rendering error:", error);
        // Return escaped HTML as fallback
        return escapeHtml(String(content));
    }
};

export const formatStreamingMessage = (content) => {
    if (!content) return "";

    try {
        let textContent = String(content || "");

        // More aggressive whitespace normalization for streaming
        textContent = textContent.trim();

        // Collapse excessive vertical whitespace (3+ newlines -> 2 newlines)
        textContent = textContent.replace(/\n{3,}/g, "\n\n");

        // Preserve leading spaces for proper formatting

        // Remove multiple consecutive spaces (but not in code blocks)
        textContent = textContent.replace(
            /([^`\n])([ ]{2,})([^`\n])/g,
            "$1 $3",
        );

        const html = marked.parse(textContent, { async: false });
        return renderMath(html);
    } catch (error) {
        console.error("Streaming markdown rendering error:", error);
        return escapeHtml(String(content));
    }
};
