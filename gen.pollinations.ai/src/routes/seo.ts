import { getPublicOrigin } from "@shared/public-origin.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";

export const SEO_TITLE = "Docs | pollinations.ai";
export const SEO_SHORT_TITLE = "Docs";
export const SEO_DESCRIPTION =
    "API docs for pollinations.ai. Generate images, text, audio, and video with easy APIs, model lists, authentication, and OpenAI-compatible endpoints.";
export const SEO_THEME_COLOR = "#fef8eb";
export const SEO_BACKGROUND_COLOR = "#110518";
export const SEO_PATH = "/docs";

const WEB_APP_MANIFEST = {
    name: SEO_TITLE,
    short_name: SEO_SHORT_TITLE,
    description: SEO_DESCRIPTION,
    icons: [
        {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
        },
        {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
        },
        {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
        },
    ],
    theme_color: SEO_THEME_COLOR,
    background_color: SEO_BACKGROUND_COLOR,
    display: "standalone",
    start_url: SEO_PATH,
} as const;

function escapeAttribute(value: string): string {
    return value.replace(/[&"<]/g, (char) => {
        switch (char) {
            case "&":
                return "&amp;";
            case '"':
                return "&quot;";
            case "<":
                return "&lt;";
            default:
                return char;
        }
    });
}

function getSeoUrls(c: Context<Env>): {
    canonicalUrl: string;
    imageUrl: string;
} {
    const publicOrigin = getPublicOrigin(c);
    return {
        canonicalUrl: `${publicOrigin}${SEO_PATH}`,
        imageUrl: `${publicOrigin}/og-image.png`,
    };
}

export function docsSocialHeadTags(c: Context<Env>): string {
    const { canonicalUrl, imageUrl } = getSeoUrls(c);
    const title = escapeAttribute(SEO_TITLE);
    const description = escapeAttribute(SEO_DESCRIPTION);
    const canonical = escapeAttribute(canonicalUrl);
    const image = escapeAttribute(imageUrl);

    return `
    <meta name="theme-color" content="${SEO_THEME_COLOR}" />
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonical}" />

    <!-- Open Graph / Social Media Meta Tags -->
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="pollinations.ai logo" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="pollinations.ai" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@pollinations_ai" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="pollinations.ai logo" />

    <!-- Favicons and Icons -->
    <link rel="icon" type="image/x-icon" href="/favicon.ico?v=dark" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=dark" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=dark" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=dark" />
    <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152x152.png?v=dark" />
    <link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon-167x167.png?v=dark" />

    <!-- PWA Manifest -->
    <link rel="manifest" href="/manifest.webmanifest" />

    <!-- iOS Meta Tags -->
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="${SEO_SHORT_TITLE}" />`;
}

export function injectDocsSocialHead(html: string, c: Context<Env>): string {
    const headClose = html.indexOf("</head>");
    if (headClose === -1) return html;
    return (
        html.slice(0, headClose) + docsSocialHeadTags(c) + html.slice(headClose)
    );
}

export function docsLandingHtml(c: Context<Env>): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="refresh" content="0;url=${SEO_PATH}" />
    <title>${SEO_TITLE}</title>
${docsSocialHeadTags(c)}
  </head>
  <body>
    <main>
      <h1>${SEO_TITLE}</h1>
      <p>${SEO_DESCRIPTION}</p>
      <p><a href="${SEO_PATH}">Open API docs</a></p>
    </main>
  </body>
</html>`;
}

export function manifestResponse(): Response {
    return new Response(`${JSON.stringify(WEB_APP_MANIFEST, null, 4)}\n`, {
        headers: {
            "Content-Type": "application/manifest+json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
        },
    });
}
