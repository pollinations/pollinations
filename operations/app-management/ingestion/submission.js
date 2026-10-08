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

// The form's platforms; a subset of APP_PLATFORMS in
// pollinations.ai/src/routes/-app-search.ts.
const PLATFORMS = new Set([
    "web",
    "android",
    "ios",
    "desktop",
    "cli",
    "discord",
    "telegram",
    "browser-ext",
    "library",
    "api",
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
    const match = String(body || "")
        // HTML comments are not content. A trailing <!-- ... --> would
        // otherwise leak into the field and break parsing (#16820).
        .replace(/<!--[\s\S]*?-->/g, "")
        .match(
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

// Issue-form uploads (and images dragged in when editing) are hosted by GitHub.
function parseScreenshotUrl(value) {
    const match = value.match(
        /https:\/\/github\.com\/user-attachments\/(?:assets|files)\/[A-Za-z0-9._/-]+/,
    );
    return match ? match[0] : "";
}

function parseSubmission(body) {
    const name = clean(section(body, "App Name"), 80);
    const description = clean(section(body, "App Description"), 200);
    const appUrl = normalizeUrl(section(body, "App URL"));
    const repoUrl = normalizeUrl(section(body, "GitHub Repository URL"));
    const category = clean(section(body, "App Category"), 30).toLowerCase();
    const platform = clean(section(body, "Platform"), 30).toLowerCase();
    const language = normalizeLanguage(section(body, "App Language"));
    const discord = clean(section(body, "Discord Username"), 80);
    const quest = clean(section(body, "Quest"), 20).replace(/^#/, "");
    const screenshotUrl = parseScreenshotUrl(section(body, "Screenshot"));

    return {
        name,
        description,
        appUrl,
        repoUrl,
        category,
        language,
        discord,
        quest,
        screenshotUrl,
        platform,
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
    if (!submission.appUrl && !submission.repoUrl)
        errors.push(
            "Provide a valid public App URL, a GitHub Repository URL, or both.",
        );
    if (!submission.screenshotUrl)
        errors.push(
            "Screenshot is required: upload an image of the app in the Screenshot field.",
        );
    if (!CATEGORIES.has(submission.category))
        errors.push("App Category must be selected from the submission form.");
    if (!PLATFORMS.has(submission.platform))
        errors.push("Platform must be selected from the submission form.");
    if (!submission.language)
        errors.push(
            "App Language must be an ISO language code such as en or pt-BR.",
        );
    if (
        submission.repoUrl &&
        !/^https:\/\/github\.com\/[^/]+\/[^/]+/i.test(submission.repoUrl)
    )
        errors.push("GitHub Repository URL must point to a GitHub repository.");
    if (submission.quest && !/^\d+$/.test(submission.quest))
        errors.push("Quest must be a quest issue number such as #15600.");
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
        url: submission.appUrl || null,
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
    parseSubmission,
    validateSubmission,
};
