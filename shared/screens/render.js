// Builds, from @pollinations/ui components, the screens the Classic API shows
// instead of an image or a reply:
// - ../free-limit-page.js: the page a browser gets past the free limit, as a
//   module both Workers and their tests can import; the Workers fill in its
//   {{placeholders}}
// - the image cards a page's <img> gets instead of a broken image, PNGs in
//   image.pollinations.ai/cloudflare-cache/assets/cards, drawn by Chrome
// Run after changing a screen or the package: npm install && npm run render
// (set CHROME to Chrome's binary when it is not in /Applications)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    BrandMark,
    Chip,
    CodeBlock,
    DiscordIcon,
    ExternalLinkButton,
    Heading,
    InlineLink,
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

// One way past the limit: a title, what it takes, and its button at the foot
const path = (title, body, button) =>
    h(
        Surface,
        { className: "polli:flex polli:flex-col polli:gap-4" },
        h(
            "div",
            { className: "polli:flex polli:flex-1 polli:flex-col polli:gap-3" },
            h(Heading, { as: "h2", size: "card" }, title),
            ...body,
        ),
        button,
    );

const page = h(
    "main",
    {
        className:
            "polli:mx-auto polli:flex polli:max-w-2xl polli:flex-col polli:gap-4 polli:p-4",
    },
    // The lockup alone, linked as Enter's dashboard brand is
    h(
        "a",
        {
            href: "https://pollinations.ai",
            "aria-label": "Pollinations",
            className: "polli:block polli:h-6 polli:text-theme-text-strong",
            style: { width: 195 },
        },
        h(BrandMark, {
            variant: "lockup",
            className: "polli:h-full polli:w-full",
        }),
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
                "The Classic API makes 1 free {{item}} every {{every}} seconds. This page reloads by itself when the time is up, or skip the wait:",
            ),
        ),
        // The two ways past the limit, side by side and equally weighted
        h(
            "div",
            { className: "paths" },
            path(
                "Sign in to enter",
                [
                    h(
                        Text,
                        { size: "sm", tone: "soft" },
                        "Unlimited {{items}} with pollen, every model, no waiting.",
                    ),
                    h(
                        Text,
                        { size: "xs", tone: "muted" },
                        "Sign in with GitHub. Start with free pollen from quests.",
                    ),
                ],
                h(
                    ExternalLinkButton,
                    {
                        href: "https://enter.pollinations.ai/?ref=classic",
                        external: false,
                        size: "lg",
                    },
                    "Get unlimited {{items}}",
                ),
            ),
            path(
                "Let your AI agent pay",
                [
                    h(
                        Text,
                        { size: "sm", tone: "soft" },
                        "0.01 USD per {{item}} with Weft. Paste this into your agent, then ask it: “Pay for this {{item}} with Weft.”",
                    ),
                    h(CodeBlock, {
                        code: "set up https://weft.network/setup.md",
                    }),
                    h(
                        Text,
                        { size: "xs", tone: "muted" },
                        "New Weft accounts get $3 in free credit once the email is verified.",
                    ),
                ],
                h(
                    ExternalLinkButton,
                    {
                        href: "https://weft.network/setup.md",
                        size: "lg",
                        showIcon: false,
                    },
                    "Give my agent a wallet",
                ),
            ),
        ),
    ),
    h(
        "div",
        { className: "polli:px-1" },
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
<style>body{margin:0;background:var(--polli-color-app-bg);font-family:var(--polli-font-body)}.paths{display:grid;gap:1rem}@media (min-width:40rem){.paths{grid-template-columns:1fr 1fr}}.bleed{display:block;width:calc(100% + 2rem);max-width:none;height:auto;margin:-1rem -1rem 0}@media (min-width:40rem){.bleed{width:calc(100% + 3.5rem);margin:-1.75rem -1.75rem 0}}</style>
</head>
<body>${renderToStaticMarkup(page)}<script>${script}</script></body>
</html>
`;

writeFileSync(
    new URL("../free-limit-page.js", import.meta.url),
    `// Built by screens/render.js: do not edit\nexport const PAGE = ${JSON.stringify(html)};\n`,
);

// The image cards, one per answer an <img> can get, in the tones of Alert
const CARDS = {
    limit: {
        tone: "polli:bg-theme-bg-active",
        title: "Free limit reached",
        body: "The Classic API makes 1 free image every 45 seconds.",
        cta: "Unlimited images: enter.pollinations.ai",
    },
    busy: {
        tone: "polli:bg-intent-warning-bg-light polli:text-intent-warning-text",
        title: "At its limit right now",
        body: "The free service is full. Reload in a few seconds.",
        cta: "Full access: enter.pollinations.ai",
    },
    error: {
        tone: "polli:bg-theme-bg-pale",
        title: "Something went wrong",
        body: "Reload in a few seconds to try again.",
        cta: "Full access: enter.pollinations.ai",
    },
    enter: {
        tone: "polli:bg-theme-bg-active",
        title: "This model runs on enter",
        body: "It isn’t part of the Classic API. Sign in to use it.",
        cta: "enter.pollinations.ai",
    },
    refused: {
        tone: "polli:bg-intent-danger-bg-light polli:text-intent-danger-text",
        title: "Image refused",
        body: "This prompt or its settings can’t be used. Try a different prompt.",
    },
};
// [CSS width, CSS height, pixel ratio]; Chrome's window is at least 520 wide
const SHAPES = {
    square: [520, 520, 2],
    wide: [640, 360, 2],
    tall: [540, 960, 4 / 3],
};

const cardPage = ({ tone, title, body, cta }) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><style>${css}</style>
<style>html,body{margin:0;height:100%;font-family:var(--polli-font-body)}</style></head>
<body>${renderToStaticMarkup(
    h(
        "div",
        {
            className: `${tone} polli:flex polli:h-full polli:flex-col polli:justify-between polli:text-theme-text-strong`,
            style: { padding: "8%" },
        },
        h(
            "span",
            { className: "polli:block polli:h-6", style: { width: 195 } },
            h(BrandMark, {
                variant: "lockup",
                className: "polli:h-full polli:w-full",
            }),
        ),
        h(
            "div",
            { className: "polli:flex polli:flex-col polli:gap-3" },
            h(Heading, { as: "h1", size: "display" }, title),
            h(Text, { size: "lg", tone: "strong" }, body),
        ),
        h(
            "div",
            { className: "polli:flex" },
            cta && h(Chip, { intent: "neutral", size: "lg" }, cta),
        ),
    ),
)}</body></html>`;

const chrome =
    process.env.CHROME ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const work = mkdtempSync(join(tmpdir(), "classic-cards-"));
for (const [kind, card] of Object.entries(CARDS)) {
    const file = join(work, `${kind}.html`);
    writeFileSync(file, cardPage(card));
    for (const [shape, [width, height, ratio]] of Object.entries(SHAPES)) {
        const png = new URL(
            `../../image.pollinations.ai/cloudflare-cache/assets/cards/${kind}-${shape}.png`,
            import.meta.url,
        );
        execFileSync(
            chrome,
            [
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                `--user-data-dir=${join(work, "profile")}`,
                `--force-device-scale-factor=${ratio}`,
                `--window-size=${width},${height}`,
                `--screenshot=${png.pathname}`,
                `file://${file}`,
            ],
            { stdio: "ignore" },
        );
    }
}
