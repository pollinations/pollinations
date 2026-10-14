// Builds ../free-limit-page.js, the page a browser gets past the free limit,
// from @pollinations/ui components, as a module both Workers and their tests
// can import. The Workers fill in its {{placeholders}}.
// Run after changing the page or the package: npm install && npm run render
import { readFileSync, writeFileSync } from "node:fs";
import {
    Alert,
    AppBrand,
    Chip,
    CodeBlock,
    DiscordIcon,
    ExternalLinkButton,
    Heading,
    InlineLink,
    KeyIcon,
    StableLabel,
    Surface,
    Text,
} from "@pollinations/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const read = (path) => readFileSync(new URL(path, import.meta.url));
const base64 = (path) => read(path).toString("base64");
const ui = "./node_modules/@pollinations/ui/dist/";

// Tailwind's reset, which apps load with the package, and the package's styles
// with the fonts this page uses inlined, so the page loads nothing else
const PAGE_FONTS = ["uncut-sans-variable", "lct-mogi-a", "fraunces-soft-bold"];
const css =
    `@layer base{${read("./node_modules/tailwindcss/preflight.css")}}` +
    read(`${ui}styles.css`)
        .toString()
        .replace(/url\(\.\/fonts\/([\w-]+)\.woff2\)/g, (url, font) =>
            PAGE_FONTS.includes(font)
                ? `url(data:font/woff2;base64,${base64(`${ui}fonts/${font}.woff2`)})`
                : url,
        );

const clock = (seconds) => `0:${String(seconds).padStart(2, "0")}`;
const CLOCKS = Array.from({ length: 46 }, (_, seconds) => clock(seconds));

// A numbered step of the Weft setup
const step = (number, title, ...children) =>
    h(
        "div",
        { className: "polli:flex polli:flex-col polli:gap-2" },
        h(
            "div",
            { className: "polli:flex polli:items-center polli:gap-2" },
            h(Chip, { intent: "neutral", size: "sm" }, number),
            h(Heading, { as: "h2", size: "card" }, title),
        ),
        ...children,
    );

// A footnote line, led by its icon as Enter's are
const footnote = (Icon, ...children) =>
    h(
        Text,
        {
            size: "sm",
            tone: "muted",
            className: "polli:flex polli:items-center polli:gap-2",
        },
        h(Icon, { className: "polli:size-3.5 polli:shrink-0" }),
        h("span", null, ...children),
    );

const page = h(
    "main",
    {
        className:
            "polli:mx-auto polli:flex polli:max-w-xl polli:flex-col polli:gap-4 polli:p-4",
    },
    h(
        "div",
        { className: "polli:flex polli:items-center polli:justify-between" },
        h(AppBrand, {
            appName: "Classic API",
            href: "https://pollinations.ai",
            size: "sm",
        }),
        h(Text, { as: "span", size: "xs", tone: "muted" }, "Pay with x402"),
    ),
    h(
        Surface,
        {
            variant: "panel",
            className:
                "polli:flex polli:flex-col polli:gap-6 polli:overflow-hidden",
        },
        // Runs to the panel's edges, as images in the website's cards do
        h("img", {
            className: "bleed",
            src: `data:image/webp;base64,${base64("../assets/weft-paywall.webp")}`,
            width: 960,
            height: 540,
            alt: "The Pollinations bee and the Weft mascot exchange a flower coin and a picture.",
        }),
        h(
            Alert,
            { intent: "info", title: "Free limit reached" },
            "Your next free {{item}} is ready in ",
            h(
                "span",
                { "data-clock": "" },
                h(StableLabel, { text: "{{clock}}", options: CLOCKS }),
            ),
            ". This page reloads by itself.",
        ),
        h(
            "div",
            { className: "polli:flex polli:flex-col polli:gap-2" },
            h(
                Heading,
                { as: "h1", size: "title" },
                "Get your {{item}} for just 0.01 USD",
            ),
            h(
                Text,
                { tone: "soft" },
                "Give your AI agent a wallet. Let it pay for the {{item}} and get back to work.",
            ),
        ),
        h(
            Surface,
            { className: "polli:flex polli:flex-col polli:gap-6" },
            step(
                "1",
                "Connect your agent",
                h(
                    Text,
                    { size: "sm", tone: "soft" },
                    "Paste this into your agent:",
                ),
                h(CodeBlock, { code: "set up https://weft.network/setup.md" }),
                h(
                    Text,
                    { size: "sm", tone: "soft" },
                    "Create your Weft account and verify your email to get $3 in free credit.",
                ),
            ),
            step(
                "2",
                "Ask it to pay",
                h(CodeBlock, { code: "Pay for this {{item}} with Weft." }),
            ),
        ),
        h(
            ExternalLinkButton,
            { href: "https://weft.network/setup.md", size: "lg" },
            "Give my agent a wallet",
        ),
        h(
            Text,
            { size: "sm", tone: "muted", className: "polli:text-center" },
            "Already connected? Ask your agent to pay for this request.",
        ),
    ),
    h(
        "div",
        { className: "polli:flex polli:flex-col polli:gap-1 polli:px-1" },
        footnote(
            KeyIcon,
            "Prefer an account? ",
            h(
                InlineLink,
                { href: "https://enter.pollinations.ai/?ref=classic" },
                "Get unlimited {{items}} on enter",
            ),
            ".",
        ),
        footnote(
            DiscordIcon,
            "Need help? ",
            h(
                InlineLink,
                {
                    href: "https://discord.gg/k9F7SyTgqn",
                    tone: "quiet",
                    showIcon: false,
                },
                "Ask on Discord",
            ),
            ".",
        ),
    ),
);

// The countdown, the reload when it ends, and CodeBlock's copy button
const script = `
let wait = {{wait}};
const label = document.querySelector("[data-clock] > span > span:last-child");
const tick = setInterval(() => {
    wait -= 1;
    if (wait <= 0) {
        clearInterval(tick);
        location.reload();
    } else label.textContent = "0:" + String(wait).padStart(2, "0");
}, 1000);
for (const button of document.querySelectorAll("button[aria-label='Copy code']")) {
    button.onclick = () =>
        navigator.clipboard?.writeText(button.parentElement.nextElementSibling.textContent);
}`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Free limit reached - Pollinations</title>
<style>${css}</style>
<style>body{margin:0;background:var(--polli-color-app-bg);font-family:var(--polli-font-body)}.bleed{display:block;width:calc(100% + 2rem);max-width:none;height:auto;margin:-1rem -1rem 0}@media (min-width:40rem){.bleed{width:calc(100% + 3.5rem);margin:-1.75rem -1.75rem 0}}</style>
</head>
<body>${renderToStaticMarkup(page)}<script>${script}</script></body>
</html>
`;

writeFileSync(
    new URL("../free-limit-page.js", import.meta.url),
    `// Built by free-limit-page/render.js: do not edit\nexport const PAGE = ${JSON.stringify(html)};\n`,
);
