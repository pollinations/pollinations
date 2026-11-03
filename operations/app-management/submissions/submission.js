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
    const match = String(body || "").match(
        new RegExp(
            `(?:^|\\n)### ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n### |$)`,
            "i",
        ),
    );
    return match ? match[1].trim() : "";
}

// Single-line fields: ignore notes or footers added below the value.
function line(body, label) {
    return section(body, label).split(/\r?\n/, 1)[0];
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

// Accept GitHub uploads and raw repository images in Markdown, HTML or plain text.
function parseScreenshotUrl(value) {
    for (const candidate of value.match(/https:\/\/[^\s<>"')]+/g) || []) {
        try {
            const url = new URL(candidate);
            if (url.username || url.password || url.port) continue;
            const attachment =
                url.hostname === "github.com" &&
                /^\/user-attachments\/(?:assets|files)\/[^/]+/.test(
                    url.pathname,
                );
            const repositoryImage =
                url.hostname === "raw.githubusercontent.com" &&
                /^\/[^/]+\/[^/]+\/[^/]+\/.+/.test(url.pathname);
            if (attachment || repositoryImage) return url.href;
        } catch {
            // Ignore malformed links and continue looking for a supported image.
        }
    }
    return "";
}

function parseSubmission(body) {
    const name = clean(line(body, "App Name"), 80);
    // Read up to 2000 characters so the length error can quote the real length.
    const description = clean(section(body, "App Description"), 2000);
    const appUrl = normalizeUrl(line(body, "App URL"));
    const repoUrl = normalizeUrl(line(body, "GitHub Repository URL"));
    const category = clean(line(body, "App Category"), 30).toLowerCase();
    const platform = clean(line(body, "Platform"), 30).toLowerCase();
    const language = normalizeLanguage(line(body, "App Language"));
    const discord = clean(line(body, "Discord Username"), 80);
    const quest = clean(line(body, "Quest"), 20).replace(/^#/, "");
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
    if (submission.description.length > 200)
        errors.push(
            `App Description is ${submission.description.length} characters; the catalog shows 200. Shorten it.`,
        );
    if (!submission.appUrl && !submission.repoUrl)
        errors.push(
            "Provide a valid public App URL, a GitHub Repository URL, or both.",
        );
    if (!submission.screenshotUrl)
        errors.push(
            "Screenshot needs a supported GitHub image URL: upload an image in the Screenshot field or link to a raw.githubusercontent.com repository image.",
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

function findCatalogDuplicate(submission, apps, githubUserId = "") {
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

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const SCREENSHOT_RULES = "PNG, JPEG, or WebP, at most 5 MB";

async function downloadScreenshot(url) {
    const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
        throw new Error(`Screenshot download returned HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

// The image format from its first bytes, so the check needs no image library
// and runs in a Worker as well as in Node.
function imageFormat(buffer) {
    const head = buffer.subarray(0, 12).toString("latin1");
    if (head.startsWith("\x89PNG\r\n\x1a\n")) return "png";
    if (head.startsWith("\xff\xd8\xff")) return "jpeg";
    if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "webp";
    if (head.startsWith("GIF8")) return "gif";
    return null;
}

async function screenshotErrors(buffer) {
    if (buffer.length > MAX_SCREENSHOT_BYTES)
        return [
            `Screenshot is ${(buffer.length / 1024 / 1024).toFixed(1)} MB; it must be ${SCREENSHOT_RULES}.`,
        ];
    const format = imageFormat(buffer);
    if (!format)
        return [
            `Screenshot is not a readable image; it must be ${SCREENSHOT_RULES}.`,
        ];
    if (format === "gif")
        return [`Screenshot is gif; it must be ${SCREENSHOT_RULES}.`];
    return [];
}

async function checkScreenshot(url) {
    try {
        return await screenshotErrors(await downloadScreenshot(url));
    } catch {
        return [
            "Screenshot could not be downloaded; upload it again in the Screenshot field.",
        ];
    }
}

// Every reason a submission cannot go on, from facts its caller gathered: the
// catalog, the other open submissions, whether its quest is open and its
// screenshot's errors. No reads here, so the publish script and the agent
// runner share one set of rules.
function submissionErrors({
    submission,
    issueNumber,
    author,
    apps,
    openSubmissions,
    questOpen,
    screenshot,
}) {
    const errors = [...validateSubmission(submission), ...screenshot];
    const duplicate = findCatalogDuplicate(submission, apps, author.id);
    if (duplicate)
        errors.push(
            `This app appears to already be listed as ${duplicate.name} in operations/app-management/app.json.`,
        );
    const pending = openSubmissions.find((candidate) => {
        if (String(candidate.number) === String(issueNumber)) return false;
        const parsed = parseSubmission(candidate.body);
        return findCatalogDuplicate(
            submission,
            [
                {
                    name: parsed.name,
                    url: parsed.appUrl,
                    repositoryUrl: parsed.repoUrl,
                    githubUserId: candidate.authorNodeId || "",
                },
            ],
            author.nodeId || "",
        );
    });
    if (pending)
        errors.push(
            `This app appears to duplicate open submission #${pending.number}: ${pending.url}`,
        );
    if (/^\d+$/.test(submission.quest) && !questOpen)
        errors.push(
            `Quest #${submission.quest} is not an open POLLEN-QUEST issue. Enter an open quest or leave the Quest field empty.`,
        );
    return errors;
}

module.exports = {
    buildApp,
    checkScreenshot,
    downloadScreenshot,
    findCatalogDuplicate,
    parseSubmission,
    screenshotErrors,
    submissionErrors,
    validateSubmission,
};
