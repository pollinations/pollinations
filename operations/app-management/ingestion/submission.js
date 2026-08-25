const { readApps } = require("../app.js");

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
    if (hostIs("youtube.com") || hostIs("youtu.be")) return "youtube";
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
    const submissionType =
        clean(section(body, "Submission Type"), 30).toLowerCase() ===
        "youtube tutorial"
            ? "youtube_tutorial"
            : "app";
    const isTutorial = submissionType === "youtube_tutorial";
    const name = clean(
        section(body, isTutorial ? "Tutorial Title" : "App Name"),
        80,
    );
    const description = clean(
        section(
            body,
            isTutorial ? "What does the tutorial teach?" : "App Description",
        ),
        200,
    );
    const appUrl = normalizeUrl(
        section(body, isTutorial ? "YouTube video" : "App URL"),
    );
    const repoUrl = normalizeUrl(section(body, "GitHub Repository URL"));
    const category = isTutorial
        ? "learn"
        : clean(section(body, "App Category"), 30).toLowerCase();
    const language = normalizeLanguage(
        section(body, isTutorial ? "Tutorial Language" : "App Language"),
    );
    const discord = clean(section(body, "Discord Username"), 80);

    return {
        submissionType,
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
    const isTutorial = submission.submissionType === "youtube_tutorial";
    if (!submission.name)
        errors.push(
            isTutorial
                ? "Tutorial Title is required."
                : "App Name is required.",
        );
    if (submission.description.length < 20)
        errors.push(
            isTutorial
                ? "The tutorial description must explain what viewers will learn."
                : "App Description must explain what the app does and how it uses Pollinations.",
        );
    if (!submission.appUrl)
        errors.push(
            isTutorial
                ? "YouTube video must be a valid public HTTP(S) URL."
                : "App URL must be a valid public HTTP(S) URL.",
        );
    if (isTutorial && submission.platform !== "youtube")
        errors.push("YouTube video must use youtube.com or youtu.be.");
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
    apps = readApps(),
    githubUserId = "",
) {
    const appUrl = normalizeComparable(submission.appUrl);
    const repoUrl = normalizeComparable(submission.repoUrl);
    const name = normalizeComparable(submission.name);
    return apps.find((app) => {
        return (
            (appUrl && normalizeComparable(app.url) === appUrl) ||
            (repoUrl && normalizeComparable(app.repositoryUrl) === repoUrl) ||
            (name &&
                githubUserId &&
                normalizeComparable(app.name) === name &&
                String(app.githubUserId) === String(githubUserId))
        );
    });
}

function buildApp(submission, metadata) {
    return {
        emoji: submission.emoji,
        name: submission.name,
        url: submission.appUrl,
        description: submission.description,
        language: submission.language,
        category: submission.category,
        platform: submission.platform,
        githubUsername: metadata.githubUsername,
        githubUserId: String(metadata.githubUserId),
        repositoryUrl: submission.repoUrl || null,
        repositoryStars: null,
        discordUsername: submission.discord || null,
        other: null,
        submittedDate: metadata.submittedDate,
        issueUrl: metadata.issueUrl,
        approvedDate: metadata.approvedDate,
        byop: false,
        requests24h: 0,
    };
}

module.exports = {
    buildApp,
    findCatalogDuplicate,
    inferPlatform,
    parseSubmission,
    validateSubmission,
};
