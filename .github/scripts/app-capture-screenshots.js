#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { readApps, writeApps } = require("./lib/app-catalog.js");

const VIEWPORT = { width: 1200, height: 600 };
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_TIMEOUT_MS = 30000;
const REVIEW_TIMEOUT_MS = 60000;
const SETTLE_MS = 3000;
const RETRY_SETTLE_MS = 8000;
const MIN_SCREENSHOT_BYTES = 5000;
const DEFAULT_REVIEW_MODEL = "qwen-vision";
const MODES = new Set(["refresh", "missing", "all"]);
const REVIEW_DECISIONS = new Set(["approved", "retry", "rejected"]);

const REVIEW_PROMPT = `You review 1200x600 screenshots used as public app-directory cover images.
Return JSON with exactly: decision (approved, retry, or rejected), score (0-100), and reason (one concise sentence).

Approve only when the app or repository is visibly loaded, its identity or purpose is understandable, meaningful content is visible, and the composition works as an attractive cover.
Retry when a cookie banner, loading or login overlay, blank or empty workspace, poor scroll position, bad crop, or other temporary presentation issue can likely be fixed by recapturing.
Reject only when the screenshot shows no usable app or repository, an error page, unsafe or private information, or content fundamentally unsuitable for the directory.
A minimalist interface may be approved when it still clearly communicates the project.`;

function getArgument(name) {
    const prefix = `--${name}=`;
    return process.argv
        .find((value) => value.startsWith(prefix))
        ?.slice(prefix.length);
}

function readPositiveInteger(name, fallback) {
    const argument = getArgument(name);
    if (argument === undefined) return fallback;

    const value = Number(argument);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`--${name} must be a positive integer`);
    }
    return value;
}

function readNonNegativeInteger(name, fallback) {
    const argument = getArgument(name);
    if (argument === undefined) return fallback;

    const value = Number(argument);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`--${name} must be a non-negative integer`);
    }
    return value;
}

function calculateDailyBatch(totalTargets, batchSize, now = new Date()) {
    if (!Number.isInteger(totalTargets) || totalTargets < 0) {
        throw new Error("totalTargets must be a non-negative integer");
    }
    if (!Number.isInteger(batchSize) || batchSize < 1) {
        throw new Error("batchSize must be a positive integer");
    }

    const batchCount = Math.ceil(totalTargets / batchSize);
    if (batchCount === 0) {
        return { batchCount: 0, batchIndex: 0, offset: 0 };
    }

    const epochDay = Math.floor(now.getTime() / 86_400_000);
    const batchIndex = epochDay % batchCount;
    return {
        batchCount,
        batchIndex,
        offset: batchIndex * batchSize,
    };
}

function slugify(value) {
    return value
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()
        .slice(0, 70);
}

function isHttpUrl(value) {
    return typeof value === "string" && /^https?:\/\//.test(value);
}

function isGitHubUrl(value) {
    if (!isHttpUrl(value)) return false;
    try {
        return new URL(value).hostname.toLowerCase() === "github.com";
    } catch {
        return false;
    }
}

function resolveTarget(app, catalogIndex) {
    if (isHttpUrl(app.url)) {
        return {
            catalogIndex,
            source: isGitHubUrl(app.url) ? "repository" : "website",
            targetUrl: app.url,
        };
    }
    if (isHttpUrl(app.repositoryUrl)) {
        return {
            catalogIndex,
            source: "repository",
            targetUrl: app.repositoryUrl,
        };
    }
    return null;
}

function selectTargets(apps, mode) {
    if (!MODES.has(mode)) {
        throw new Error(`--mode must be one of: ${[...MODES].join(", ")}`);
    }

    const byTarget = new Map();
    const skipped = [];

    for (const [catalogIndex, app] of apps.entries()) {
        const included =
            mode === "all" ||
            (mode === "refresh" && !!app.screenshotUrl) ||
            (mode === "missing" && !app.screenshotUrl);
        if (!included) continue;

        const resolved = resolveTarget(app, catalogIndex);
        if (!resolved) {
            skipped.push({
                catalogIndex,
                name: app.name,
                reason: "No website or repository URL",
            });
            continue;
        }

        const key = `${resolved.source}:${resolved.targetUrl}`;
        const existing = byTarget.get(key);
        if (existing) {
            existing.catalogIndices.push(catalogIndex);
            existing.names.push(app.name);
            continue;
        }

        byTarget.set(key, {
            catalogIndices: [catalogIndex],
            key,
            name: app.name,
            names: [app.name],
            source: resolved.source,
            targetUrl: resolved.targetUrl,
        });
    }

    return { skipped, targets: [...byTarget.values()] };
}

async function dismissConsent(page) {
    const consentButton = page
        .getByRole("button", {
            name: /^(accept all|accept all cookies|allow all|i agree)$/i,
        })
        .first();

    try {
        await consentButton.click({ timeout: 1500 });
        await page.waitForTimeout(500);
    } catch {
        // Most targets do not show a consent prompt.
    }
}

async function resetScroll(page) {
    await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
        for (const element of document.querySelectorAll("*")) {
            if (element.scrollTop > 0) element.scrollTop = 0;
            if (element.scrollLeft > 0) element.scrollLeft = 0;
        }
    });
}

async function prepareRepository(page) {
    const readme = page.locator("#readme").first();
    try {
        await readme.waitFor({ state: "visible", timeout: 3000 });
        await readme.evaluate((element) => {
            const top = element.getBoundingClientRect().top + window.scrollY;
            window.scrollTo(0, Math.max(0, top - 90));
        });
    } catch {
        // Repositories without a rendered README stay at the page top.
    }
}

async function preparePageForCapture(page, source) {
    await dismissConsent(page);
    await resetScroll(page);
    if (source === "repository") await prepareRepository(page);
    await page.waitForTimeout(250);
}

function screenshotFilename(target, suffix = "") {
    const index = String(target.catalogIndices[0]).padStart(4, "0");
    const name = slugify(target.name) || "app";
    return `${index}-${name}${suffix}.png`;
}

async function capture(
    browser,
    target,
    outputDirectory,
    timeoutMs,
    settleMs,
    suffix = "",
) {
    const startedAt = Date.now();
    const context = await browser.newContext({
        reducedMotion: "reduce",
        viewport: VIEWPORT,
    });
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.dismiss());

    try {
        const response = await page.goto(target.targetUrl, {
            timeout: timeoutMs,
            waitUntil: "domcontentloaded",
        });
        const status = response?.status() ?? null;
        if (status !== 200) {
            throw new Error(
                `Expected HTTP 200, received ${status ?? "no response"}`,
            );
        }

        await page.waitForTimeout(settleMs);
        await preparePageForCapture(page, target.source);

        const screenshotPath = path.join(
            outputDirectory,
            screenshotFilename(target, suffix),
        );
        await page.screenshot({
            animations: "disabled",
            path: screenshotPath,
        });

        const screenshotBytes = fs.statSync(screenshotPath).size;
        if (screenshotBytes < MIN_SCREENSHOT_BYTES) {
            throw new Error(
                `Screenshot is suspiciously small (${screenshotBytes} bytes)`,
            );
        }

        const visibleTextLength = await page.evaluate(
            () => document.body?.innerText?.trim().length ?? 0,
        );

        return {
            ...target,
            durationMs: Date.now() - startedAt,
            finalUrl: page.url(),
            pageTitle: await page.title(),
            screenshotBytes,
            screenshotPath,
            status,
            success: true,
            visibleTextLength,
        };
    } catch (error) {
        return {
            ...target,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
            finalUrl: page.url(),
            success: false,
        };
    } finally {
        await context.close();
    }
}

function validateReview(review) {
    if (!review || typeof review !== "object") {
        throw new Error("Reviewer returned a non-object response");
    }
    if (!REVIEW_DECISIONS.has(review.decision)) {
        throw new Error("Reviewer returned an invalid decision");
    }
    if (
        typeof review.score !== "number" ||
        review.score < 0 ||
        review.score > 100
    ) {
        throw new Error("Reviewer returned an invalid score");
    }
    if (typeof review.reason !== "string" || !review.reason.trim()) {
        throw new Error("Reviewer returned an invalid reason");
    }
    return review;
}

async function reviewScreenshot(result, token, model) {
    const startedAt = Date.now();
    try {
        const image = fs.readFileSync(result.screenshotPath).toString("base64");
        const response = await fetch(
            "https://gen.pollinations.ai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    max_tokens: 300,
                    messages: [
                        { role: "system", content: REVIEW_PROMPT },
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: `Project: ${result.name}. Source: ${result.source}. Review this candidate cover.`,
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: `data:image/png;base64,${image}`,
                                    },
                                },
                            ],
                        },
                    ],
                    model,
                    response_format: { type: "json_object" },
                    temperature: 0,
                }),
                signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS),
            },
        );
        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}: ${await response.text()}`,
            );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        const review = validateReview(JSON.parse(content));
        return {
            decision: review.decision,
            durationMs: Date.now() - startedAt,
            model: data.model || model,
            reason: review.reason,
            score: review.score,
            success: true,
        };
    } catch (error) {
        return {
            decision: "error",
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
            model,
            reason: "Screenshot review failed",
            score: 0,
            success: false,
        };
    }
}

async function uploadScreenshot(result, token, timeoutMs) {
    const startedAt = Date.now();
    const form = new FormData();
    form.append(
        "file",
        new Blob([fs.readFileSync(result.screenshotPath)], {
            type: "image/png",
        }),
        path.basename(result.screenshotPath),
    );

    try {
        const response = await fetch("https://media.pollinations.ai/upload", {
            body: form,
            headers: { Authorization: `Bearer ${token}` },
            method: "POST",
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}: ${await response.text()}`,
            );
        }

        const data = await response.json();
        if (typeof data.url !== "string") {
            throw new Error("Upload response did not contain a URL");
        }

        return {
            catalogIndices: result.catalogIndices,
            durationMs: Date.now() - startedAt,
            mediaUrl: data.url,
            name: result.name,
            source: result.source,
            success: true,
            targetUrl: result.targetUrl,
        };
    } catch (error) {
        return {
            catalogIndices: result.catalogIndices,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
            name: result.name,
            source: result.source,
            success: false,
            targetUrl: result.targetUrl,
        };
    }
}

function applyMediaUrls(apps, uploadResults) {
    let rowsUpdated = 0;
    for (const result of uploadResults) {
        if (!result.success || !result.mediaUrl) continue;
        for (const catalogIndex of result.catalogIndices) {
            if (!apps[catalogIndex]) continue;
            apps[catalogIndex].screenshotUrl = result.mediaUrl;
            rowsUpdated++;
        }
    }
    return rowsUpdated;
}

function updateCatalog(uploadResults) {
    const apps = readApps();
    const rowsUpdated = applyMediaUrls(apps, uploadResults);
    if (rowsUpdated > 0) writeApps(apps);
    return rowsUpdated;
}

async function runWorkers(targets, concurrency, action, runTarget) {
    const results = new Array(targets.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < targets.length) {
            const index = nextIndex++;
            const target = targets[index];
            console.log(
                `${action} [${index + 1}/${targets.length}] ${target.name}`,
            );
            results[index] = await runTarget(target);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(concurrency, targets.length) }, worker),
    );
    return results;
}

function combineReview(captureResult, review) {
    return {
        ...captureResult,
        approved: review.decision === "approved",
        review,
    };
}

async function reviewCaptures(captures, concurrency, token, model) {
    return runWorkers(
        captures,
        concurrency,
        "Reviewing",
        async (captureResult) =>
            combineReview(
                captureResult,
                await reviewScreenshot(captureResult, token, model),
            ),
    );
}

async function main() {
    const concurrency = readPositiveInteger("concurrency", DEFAULT_CONCURRENCY);
    const timeoutMs = readPositiveInteger("timeout", DEFAULT_TIMEOUT_MS);
    let offset = readNonNegativeInteger("offset", 0);
    const limit = getArgument("limit")
        ? readPositiveInteger("limit")
        : Number.POSITIVE_INFINITY;
    const mode = getArgument("mode") || "refresh";
    const rotateDaily = process.argv.includes("--rotate-daily");
    const publish = process.argv.includes("--publish");
    const shouldReview = !process.argv.includes("--no-review");
    const reviewModel =
        getArgument("review-model") ||
        process.env.SCREENSHOT_REVIEW_MODEL ||
        DEFAULT_REVIEW_MODEL;
    const token = process.env.COMMUNITY_APP_MANAGEMENT_KEY;
    if ((publish || shouldReview) && !token) {
        throw new Error("COMMUNITY_APP_MANAGEMENT_KEY missing");
    }

    const apps = readApps();
    const selection = selectTargets(apps, mode);
    let dailyBatch = null;
    if (rotateDaily) {
        if (!Number.isFinite(limit)) {
            throw new Error("--rotate-daily requires --limit");
        }
        if (getArgument("offset") !== undefined) {
            throw new Error("--rotate-daily cannot be combined with --offset");
        }
        dailyBatch = calculateDailyBatch(selection.targets.length, limit);
        offset = dailyBatch.offset;
    }
    const targets = selection.targets.slice(offset, offset + limit);
    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDirectory = path.resolve(
        process.cwd(),
        "temp/app-screenshots",
        runId,
    );
    fs.mkdirSync(outputDirectory, { recursive: true });

    const batchLabel = dailyBatch
        ? `, daily batch ${dailyBatch.batchIndex + 1}/${dailyBatch.batchCount}`
        : "";
    console.log(
        `Selected ${targets.length}/${selection.targets.length} unique ${mode} targets (${VIEWPORT.width}x${VIEWPORT.height}, concurrency ${concurrency}${batchLabel})`,
    );

    const batchStartedAt = Date.now();
    const browser = await chromium.launch();
    let captures;
    let retryCaptures = [];
    try {
        captures = await runWorkers(
            targets,
            concurrency,
            "Capturing",
            (target) =>
                capture(browser, target, outputDirectory, timeoutMs, SETTLE_MS),
        );

        const successfulCaptures = captures.filter((result) => result.success);
        let reviewed = shouldReview
            ? await reviewCaptures(
                  successfulCaptures,
                  concurrency,
                  token,
                  reviewModel,
              )
            : successfulCaptures.map((result) =>
                  combineReview(result, {
                      decision: "approved",
                      model: "disabled",
                      reason: "Vision review disabled by --no-review",
                      score: 100,
                      success: true,
                  }),
              );

        const retryTargets = reviewed
            .filter((result) => result.review.decision === "retry")
            .map(({ review, approved, ...target }) => target);
        if (retryTargets.length > 0) {
            retryCaptures = await runWorkers(
                retryTargets,
                concurrency,
                "Recapturing",
                (target) =>
                    capture(
                        browser,
                        target,
                        outputDirectory,
                        timeoutMs,
                        RETRY_SETTLE_MS,
                        "-retry",
                    ),
            );
            const successfulRetries = retryCaptures.filter(
                (result) => result.success,
            );
            const reviewedRetries = shouldReview
                ? await reviewCaptures(
                      successfulRetries,
                      concurrency,
                      token,
                      reviewModel,
                  )
                : successfulRetries.map((result) =>
                      combineReview(result, {
                          decision: "approved",
                          model: "disabled",
                          reason: "Vision review disabled by --no-review",
                          score: 100,
                          success: true,
                      }),
                  );
            const retryByKey = new Map(
                reviewedRetries.map((result) => [result.key, result]),
            );
            reviewed = reviewed.map(
                (result) => retryByKey.get(result.key) || result,
            );
        }

        const captureFailures = captures
            .filter((result) => !result.success)
            .map((result) => ({ ...result, approved: false }));
        captures = [...reviewed, ...captureFailures];
    } finally {
        await browser.close();
    }

    const approvedCaptures = captures.filter((result) => result.approved);
    let uploads = [];
    let catalogRowsUpdated = 0;
    if (publish && approvedCaptures.length > 0) {
        uploads = await runWorkers(
            approvedCaptures,
            concurrency,
            "Uploading",
            (result) => uploadScreenshot(result, token, timeoutMs),
        );
        catalogRowsUpdated = updateCatalog(
            uploads.filter((result) => result.success),
        );
    }

    const failures = captures
        .filter((result) => !result.approved)
        .map((result) => ({
            error: result.error,
            name: result.name,
            review: result.review,
            source: result.source,
            targetUrl: result.targetUrl,
        }));
    const report = {
        approved: approvedCaptures.length,
        catalogRowsUpdated,
        concurrency,
        dailyBatch,
        durationMs: Date.now() - batchStartedAt,
        failures,
        finishedAt: new Date().toISOString(),
        limit: Number.isFinite(limit) ? limit : null,
        mode,
        offset,
        publish,
        results: captures,
        retryCaptures,
        reviewEnabled: shouldReview,
        reviewModel: shouldReview ? reviewModel : null,
        selectedTargets: targets.length,
        skipped: selection.skipped,
        timeoutMs,
        totalTargets: selection.targets.length,
        uploads,
        viewport: VIEWPORT,
    };
    const reportPath = path.join(outputDirectory, "report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    const uploadSuccesses = uploads.filter((result) => result.success).length;
    console.log(
        `Finished: ${approvedCaptures.length}/${targets.length} approved, ${failures.length} flagged`,
    );
    if (publish) {
        console.log(
            `Published: ${uploadSuccesses}/${approvedCaptures.length} uploaded, ${catalogRowsUpdated} catalog rows updated`,
        );
    }
    console.log(`Report: ${reportPath}`);

    if (
        targets.length > 0 &&
        (approvedCaptures.length === 0 || (publish && uploadSuccesses === 0))
    ) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}

module.exports = {
    applyMediaUrls,
    calculateDailyBatch,
    resolveTarget,
    selectTargets,
    validateReview,
};
