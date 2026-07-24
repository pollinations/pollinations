const { parseApps } = require("./parse-apps.js");

const CATEGORIES = new Set([
    "image",
    "video_audio",
    "writing",
    "chat",
    "games",
    "learn",
    "bots",
    "build",
    "business",
]);

const CATEGORY_EMOJI = {
    image: "🖼️",
    video_audio: "🎬",
    writing: "✍️",
    chat: "💬",
    games: "🎮",
    learn: "📚",
    bots: "🤖",
    build: "🛠️",
    business: "💼",
};

function clean(value, maxLength = 200) {
    if (!value || value === "_No response_") return "";
    return String(value)
        .replace(/[|`<>]/g, " ")
        .replace(/\p{Cc}/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function section(body, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = String(body || "").match(
        new RegExp(
            `(?:^|\\n)### ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n### |$)`,
            "i",
        ),
    );
    return match ? match[1].trim() : "";
}

function normalizeUrl(value) {
    const input = clean(value, 500);
    if (!input) return "";
    try {
        const url = new URL(input);
        if (!["http:", "https:"].includes(url.protocol)) return "";
        url.hash = "";
        return url.toString().replace(/\/$/, "");
    } catch {
        return "";
    }
}

function normalizeLanguage(value) {
    const language = clean(value, 15) || "en";
    return /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(language) ? language : "";
}

function inferPlatform(name, appUrl, description) {
    const text = `${name} ${description}`.toLowerCase();
    let hostname = "";
    let pathname = "";
    try {
        const parsed = new URL(appUrl);
        hostname = parsed.hostname.toLowerCase();
        pathname = parsed.pathname.toLowerCase();
    } catch {}

    const hostIs = (domain) =>
        hostname === domain || hostname.endsWith(`.${domain}`);
    if (hostIs("play.google.com")) return "android";
    if (hostIs("apps.apple.com") || hostIs("routinehub.co")) return "ios";
    if (hostIs("discord.com") || hostIs("discord.gg")) return "discord";
    if (hostIs("t.me")) return "telegram";
    if (hostIs("npmjs.com") || hostIs("pypi.org")) return "library";
    if (hostIs("addons.mozilla.org") || hostIs("chromewebstore.google.com"))
        return "browser-ext";
    if (hostIs("wordpress.org") && pathname.startsWith("/plugins"))
        return "wordpress";
    if (text.includes("discord bot")) return "discord";
    if (text.includes("telegram bot")) return "telegram";
    if (text.includes("browser extension")) return "browser-ext";
    if (/\b(command[- ]line|cli)\b/.test(text)) return "cli";
    if (text.includes("desktop app")) return "desktop";
    return hostname ? "web" : "api";
}

function parseSubmission(body) {
    const name = clean(section(body, "App Name"), 80);
    const description = clean(section(body, "App Description"), 200);
    const appUrl = normalizeUrl(section(body, "App URL"));
    const repoUrl = normalizeUrl(section(body, "GitHub Repository URL"));
    const category = clean(section(body, "App Category"), 30).toLowerCase();
    const language = normalizeLanguage(section(body, "App Language"));
    const discord = clean(section(body, "Discord Username"), 80);

    return {
        name,
        description,
        appUrl,
        repoUrl,
        category,
        language,
        discord,
        platform: inferPlatform(name, appUrl || repoUrl, description),
        emoji: CATEGORY_EMOJI[category] || "🚀",
    };
}

function validateSubmission(submission) {
    const errors = [];
    if (!submission.name) errors.push("App Name is required.");
    if (submission.description.length < 20)
        errors.push(
            "App Description must explain what the app does and how it uses Pollinations.",
        );
    if (!submission.appUrl)
        errors.push("App URL must be a valid public HTTP(S) URL.");
    if (!CATEGORIES.has(submission.category))
        errors.push("App Category must be selected from the submission form.");
    if (!submission.language)
        errors.push(
            "App Language must be an ISO language code such as en or pt-BR.",
        );
    if (
        submission.repoUrl &&
        !/^https:\/\/github\.com\/[^/]+\/[^/]+/i.test(submission.repoUrl)
    )
        errors.push("GitHub Repository URL must point to a GitHub repository.");
    return errors;
}

function normalizeComparable(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\.git$/, "")
        .replace(/\/$/, "");
}

function findCatalogDuplicate(
    submission,
    apps = parseApps().apps,
    githubUsername = "",
) {
    const appUrl = normalizeComparable(submission.appUrl);
    const repoUrl = normalizeComparable(submission.repoUrl);
    const name = normalizeComparable(submission.name);
    return apps.find((app) => {
        return (
            (appUrl && normalizeComparable(app.webUrl) === appUrl) ||
            (repoUrl && normalizeComparable(app.repoUrl) === repoUrl) ||
            (name &&
                githubUsername &&
                normalizeComparable(app.name) === name &&
                normalizeComparable(app.githubUsername).replace(/^@/, "") ===
                    normalizeComparable(githubUsername).replace(/^@/, ""))
        );
    });
}

function buildRow(submission, metadata) {
    const fields = [
        submission.emoji,
        submission.name,
        submission.appUrl,
        submission.description,
        submission.language,
        submission.category,
        submission.platform,
        `@${metadata.githubUsername}`,
        String(metadata.githubUserId),
        submission.repoUrl,
        "",
        submission.discord,
        "",
        metadata.submittedDate,
        metadata.issueUrl,
        metadata.approvedDate,
        "",
        "",
    ];
    return `| ${fields.join(" | ")} |`;
}

module.exports = {
    buildRow,
    findCatalogDuplicate,
    inferPlatform,
    parseSubmission,
    validateSubmission,
};
