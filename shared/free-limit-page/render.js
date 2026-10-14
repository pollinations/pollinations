// Builds ../free-limit-page.js, the page a browser gets past the free limit,
// from @pollinations/ui components, as a module both Workers and their tests
// can import. The Workers fill in its {{placeholders}}.
// Run after changing the page or the package: npm install && npm run render
import { readFileSync, writeFileSync } from "node:fs";
import {
    AppBrand,
    CodeBlock,
    ExternalLinkButton,
    Heading,
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

const page = h(
    "main",
    { className: "polli:mx-auto polli:max-w-xl polli:p-4" },
    h(
        Surface,
        {
            variant: "panel",
            className: "polli:flex polli:flex-col polli:gap-6",
        },
        h(AppBrand, {
            appName: "Free API Classic",
            href: "https://pollinations.ai",
            size: "sm",
        }),
        h("img", {
            src: `data:image/webp;base64,${base64("../assets/weft-paywall.webp")}`,
            width: 960,
            height: 540,
            alt: "The Pollinations bee and the Weft mascot exchange a flower coin and a picture.",
            style: { width: "100%", height: "auto", borderRadius: 16 },
        }),
        h(
            "div",
            { className: "polli:flex polli:flex-col polli:gap-2" },
            h(
                Heading,
                { as: "h1", size: "title" },
                "Your next free {{item}} is ready in ",
                h(
                    "span",
                    { "data-clock": "" },
                    h(StableLabel, { text: "{{clock}}", options: CLOCKS }),
                ),
            ),
            h(
                Text,
                { tone: "soft" },
                "Free API Classic makes 1 {{item}} every {{every}} seconds. This page reloads by itself when the time is up.",
            ),
        ),
        h(
            "div",
            { className: "polli:flex polli:flex-col polli:gap-2" },
            h(
                ExternalLinkButton,
                {
                    href: "https://enter.pollinations.ai/?ref=classic",
                    external: false,
                    size: "lg",
                },
                "Get unlimited {{items}}",
            ),
            h(
                Text,
                { size: "sm", tone: "muted", className: "polli:text-center" },
                "Sign in to enter and buy pollen. More models, no waiting.",
            ),
        ),
        h(
            Surface,
            { className: "polli:flex polli:flex-col polli:gap-3" },
            h(
                Heading,
                { as: "h2", size: "card" },
                "Or let your AI agent pay 0.01 USD with Weft",
            ),
            h(
                Text,
                { size: "sm", tone: "soft" },
                "Paste this into your agent:",
            ),
            h(CodeBlock, { code: "set up https://weft.network/setup.md" }),
            h(
                Text,
                { size: "sm", tone: "soft" },
                "Then ask it: “Pay for this {{item}} with Weft.” New Weft accounts get $3 in free credit.",
            ),
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
<style>body{margin:0;background:var(--polli-color-app-bg);font-family:var(--polli-font-body)}</style>
</head>
<body>${renderToStaticMarkup(page)}<script>${script}</script></body>
</html>
`;

writeFileSync(
    new URL("../free-limit-page.js", import.meta.url),
    `// Built by free-limit-page/render.js: do not edit\nexport const PAGE = ${JSON.stringify(html)};\n`,
);
