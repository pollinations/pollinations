// MCP Apps view for generateImage results:
// https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
export const IMAGE_CARD_URI = "ui://pollinations/image-card.html";

// The upstream browser SDK, pinned so the card never changes under us.
const EXT_APPS_URL =
    "https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps@2.0.3/dist/src/app-with-deps.js";

// The host sandboxes the card; it only loads the SDK and the generated image.
export const IMAGE_CARD_CSP = {
    resourceDomains: [
        "https://cdn.jsdelivr.net",
        "https://media.pollinations.ai",
    ],
};

// Browser code.
const CARD_SCRIPT = `
import { App, applyDocumentTheme, applyHostStyleVariables } from "${EXT_APPS_URL}";
const $ = (id) => document.getElementById(id);
const app = new App({ name: "Pollinations image card", version: "1.0.0" });
let args = {};

function showInput(input) {
    args = input ?? {};
    $("prompt").textContent = args.prompt ?? "";
    $("meta").textContent = [args.model, args.seed === undefined ? "" : "seed " + args.seed]
        .filter(Boolean)
        .join(" · ");
}

function showResult(result) {
    const link = result.content?.find((block) => block.type === "resource_link");
    const text = result.content?.find((block) => block.type === "text")?.text;
    if (result.isError || !link) {
        $("status").textContent = text ?? "No image was returned.";
        return;
    }
    $("image").src = link.uri;
    $("image").alt = args.prompt ?? "Generated image";
    $("status").textContent = "";
}

function applyContext(context) {
    if (context?.theme) applyDocumentTheme(context.theme);
    if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
}

app.ontoolinput = ({ arguments: input }) => showInput(input);
app.ontoolresult = showResult;
app.onhostcontextchanged = applyContext;

$("variation").addEventListener("click", async () => {
    $("variation").disabled = true;
    $("status").textContent = "Generating a variation…";
    showInput({ ...args, seed: Math.floor(Math.random() * 2147483647) });
    try {
        showResult(await app.callServerTool({ name: "generateImage", arguments: args }));
    } catch (error) {
        $("status").textContent = error.message;
    } finally {
        $("variation").disabled = false;
    }
});

await app.connect();
applyContext(app.getHostContext());
$("variation").hidden = !app.getHostCapabilities()?.serverTools;
`;

export const IMAGE_CARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Pollinations image</title>
<style>
:root { color-scheme: light dark; font-family: var(--font-sans, system-ui, sans-serif); }
body { margin: 0; padding: 12px; color: var(--color-text-primary, CanvasText); }
img { display: block; width: 100%; min-height: 120px; border-radius: var(--border-radius-lg, 12px); background: var(--color-background-secondary, color-mix(in srgb, CanvasText 8%, Canvas)); }
img:not([src]) { aspect-ratio: 1; }
#prompt { margin: 10px 0 4px; font-size: var(--font-text-md-size, 15px); line-height: var(--font-text-md-line-height, 1.4); }
footer { display: flex; gap: 8px; align-items: center; justify-content: space-between; color: var(--color-text-secondary, GrayText); font-size: var(--font-text-sm-size, 13px); }
button { font: inherit; color: inherit; padding: 6px 12px; cursor: pointer; border-radius: var(--border-radius-md, 8px); border: 1px solid var(--color-border-primary, color-mix(in srgb, CanvasText 25%, transparent)); background: var(--color-background-primary, Canvas); }
button:disabled { opacity: 0.6; cursor: progress; }
#status:empty { display: none; }
</style>
</head>
<body>
<img id="image" alt="">
<p id="prompt"></p>
<footer>
<span id="meta"></span>
<button id="variation" type="button" hidden>Variation</button>
</footer>
<p id="status" role="status"></p>
<script type="module">
${CARD_SCRIPT}
</script>
</body>
</html>
`;
