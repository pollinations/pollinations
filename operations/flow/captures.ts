import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import {
    DYNAMIC_NEWS_COUNT,
    HIGHLIGHTS_RAW_URL,
    parseHighlights,
} from "@frontend/components/news-faq/highlights";
import {
    type Browser,
    type BrowserContext,
    type Response as BrowserResponse,
    chromium,
    type Page,
} from "playwright";
import { captureDocument } from "./capture-document";
import type { PreviewCaseResult, PreviewResult } from "./capture-types";
import githubProfile from "./github-profile.json";
import type { LocalState } from "./live-client";
import {
    ADMIN_ORIGIN,
    ENTER_ORIGIN as origin,
    screenOrigin,
} from "./local-origins";
import type { ReviewCase } from "./review-cases";
import { initialReviewSteps } from "./review-driver";
import { prepareReviewCase } from "./review-prepare";
import type { ReviewRequest } from "./review-requests";
import { serveReviewTransport } from "./review-transport";
import type { startRuntime } from "./runtime";
import { screenRoute } from "./screen-route";

const endpoint = "/__flow/previews";
const viewports = {
    mobile: { width: 375, height: 815 },
    desktop: { width: 1280, height: 800 },
};

export type ReviewCaseModule = {
    reviewCasesForFlow(flow: string, section: string): ReviewCase[];
};

type Selection = {
    flow: string;
    section: string;
    theme: "light" | "dark";
    size: keyof typeof viewports;
};

type Job = {
    key: string;
    version: number;
    selection: Selection;
    recipe: ReviewCase;
    revision: string;
    result: PreviewCaseResult;
};

// Only recipes with identical preparation, execution and verification share a
// capture. Display identifiers may differ between entry paths; behavior may not.
export function captureIdentity(recipe: ReviewCase, selection: Selection) {
    const {
        id,
        pageId: _pageId,
        family: _family,
        title: _title,
        variant: _variant,
        provider: _provider,
        ...behavior
    } = recipe;
    return JSON.stringify(
        {
            behavior,
            size: selection.size,
            theme: selection.theme,
            verifyDeviceGrant:
                selection.flow === "device" && id === "device-result",
        },
        (_key, value) =>
            value && typeof value === "object" && !Array.isArray(value)
                ? Object.fromEntries(
                      Object.entries(value).sort(([a], [b]) =>
                          a.localeCompare(b),
                      ),
                  )
                : value,
    );
}

export function createCaptureService(options: {
    loadCases(): Promise<ReviewCaseModule>;
    loadRuntime(): Promise<typeof startRuntime>;
}) {
    let version = 1;
    let closed = false;
    let processing: Promise<void> | undefined;
    let activeContext: BrowserContext | undefined;
    const jobs = new Map<string, Job>();
    const images = new Map<string, Buffer>();
    const documents = new Map<string, string>();
    const queue: Job[] = [];

    function current(job: Job) {
        return !closed && job.version === version && jobs.get(job.key) === job;
    }

    type Resources = {
        version: number;
        runtime: Awaited<ReturnType<typeof startRuntime>>;
        browser?: Browser;
        transport?: Awaited<ReturnType<typeof serveReviewTransport>>;
        callbackRequests: number;
    };
    let resources: Resources | undefined;
    let activeJob: Job | undefined;

    async function disposeResources() {
        const previous = resources;
        resources = undefined;
        if (!previous) return;
        try {
            await previous.browser?.close();
        } finally {
            try {
                if (previous.transport) {
                    const transport = previous.transport;
                    await new Promise<void>((resolve) => {
                        transport.close(() => resolve());
                        if ("closeAllConnections" in transport)
                            transport.closeAllConnections();
                    });
                }
            } finally {
                await previous.runtime.dispose();
            }
        }
    }

    async function getResources() {
        if (resources?.version === version && resources.browser?.isConnected())
            return resources as Resources & { browser: Browser };
        await disposeResources();
        const sourceVersion = version;
        const createRuntime = await options.loadRuntime();
        const session: Resources = {
            version: sourceVersion,
            runtime: await createRuntime({ persist: false }),
            callbackRequests: 0,
        };
        resources = session;
        session.transport = await serveReviewTransport((request) => {
            if (new URL(request.url).pathname === "/api/auth/callback/github")
                session.callbackRequests++;
            return session.runtime.fetch(request);
        });
        const transportOrigin = `http://127.0.0.1:${(session.transport.address() as AddressInfo).port}`;
        // Reuse the browser and services, not page storage or account state.
        // The proxy covers every native redirect, including OAuth callbacks.
        session.browser = await chromium.launch({
            headless: true,
            proxy: {
                server: transportOrigin,
                // Only the exact public resources below can bypass local services.
                bypass: `<-loopback>,${new URL(githubProfile.avatar_url).hostname},${new URL(HIGHLIGHTS_RAW_URL).hostname}`,
            },
        });
        return session as Resources & { browser: Browser };
    }

    async function capture(job: Job) {
        const { recipe } = job;
        console.info(
            `Flow preview: ${job.selection.flow}/${job.selection.section}/${recipe.id}`,
        );
        let stage = "starting the disposable local services";
        let context: BrowserContext | undefined;
        let page: Page | undefined;
        const diagnostics: string[] = [];
        let highlightsResponse: BrowserResponse | undefined;
        try {
            const session = await getResources();
            const { runtime, browser } = session;
            if (!current(job)) return;
            session.callbackRequests = 0;
            stage = "preparing the isolated account";
            const preparedRuntime = runtime;
            const changed = await prepareReviewCase(recipe, (path, body) =>
                preparedRuntime.fetch(
                    new Request(`${origin}${path}`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        ...(body !== undefined && {
                            body: JSON.stringify(body),
                        }),
                    }),
                ),
            );
            const preparedState = await runtime.fetch(
                new Request(`${origin}/__flow/state`),
            );
            if (!preparedState.ok)
                throw new Error("Prepared state unavailable");
            const state = (await preparedState.json()) as LocalState;
            const entryRoute = screenRoute(
                new URLSearchParams(recipe.query),
                state,
                origin,
            );
            context = await browser.newContext({
                viewport: viewports[job.selection.size],
                colorScheme: job.selection.theme,
                deviceScaleFactor: 1,
                serviceWorkers: "block",
            });
            activeContext = context;
            context.on("response", async (response) => {
                if (response.url() === HIGHLIGHTS_RAW_URL) {
                    highlightsResponse = response;
                    diagnostics.push(`News highlights: ${response.status()}`);
                }
                const path = new URL(response.url()).pathname;
                if (
                    response.request().isNavigationRequest() ||
                    path === "/api/auth/account-info"
                )
                    diagnostics.push(`${response.status()} ${path}`);
            });
            if (
                (recipe.action?.type === "sign-in"
                    ? recipe.action.outcome
                    : undefined) === "provider-error"
            ) {
                context.on("request", (request) => {
                    const path = new URL(request.url()).pathname;
                    if (
                        [
                            "/__flow/identity",
                            "/api/auth/callback/github",
                        ].includes(path)
                    ) {
                        diagnostics.push(`${request.method()} ${path}`);
                        if (request.method() === "POST") {
                            const requestOrigin = request.headers().origin;
                            diagnostics.push(
                                `Origin: ${requestOrigin === origin ? "same-origin" : requestOrigin === "null" ? "null" : requestOrigin ? "other" : "absent"}`,
                            );
                        }
                    }
                });
                context.on("response", (response) => {
                    const path = new URL(response.url()).pathname;
                    if (
                        [
                            "/__flow/identity",
                            "/api/auth/callback/github",
                        ].includes(path)
                    )
                        diagnostics.push(`${response.status()} ${path}`);
                });
            }
            // Install only the real fixture cookie returned by this
            // disposable runtime. Never copy the Journey browser session.
            const sessionCookie = changed.headers
                .getSetCookie()
                .find(
                    (cookie) =>
                        cookie.startsWith("better-auth.session_token=") &&
                        !cookie.includes("Max-Age=0"),
                );
            if (sessionCookie) {
                await context.addCookies([
                    {
                        name: "better-auth.session_token",
                        value: sessionCookie
                            .split(";")[0]
                            .slice("better-auth.session_token=".length),
                        url: origin,
                        httpOnly: true,
                        sameSite: "Lax",
                    },
                ]);
            }
            await context.route("**/*", async (route) => {
                try {
                    const request = route.request();
                    const url = new URL(request.url());
                    const profileImage =
                        request.resourceType() === "image" &&
                        url.href === githubProfile.avatar_url;
                    const newsFeed =
                        request.resourceType() === "fetch" &&
                        request.method() === "GET" &&
                        url.href === HIGHLIGHTS_RAW_URL;
                    if (
                        url.origin !== origin &&
                        url.origin !== ADMIN_ORIGIN &&
                        !profileImage &&
                        !newsFeed
                    ) {
                        await route.abort("blockedbyclient");
                        return;
                    }
                    await route.continue();
                } catch {
                    await route.abort("failed").catch(() => {});
                }
            });
            stage = "loading the real page";
            page = await context.newPage();
            page.on("requestfailed", (request) => {
                if (request.url() === HIGHLIGHTS_RAW_URL)
                    diagnostics.push("News highlights: request failed");
                if (request.url() === githubProfile.avatar_url)
                    diagnostics.push(
                        `GitHub avatar: ${request.failure()?.errorText ?? "load failed"}`,
                    );
            });
            const visitedRoutes = new Set<string>();
            page.on("request", (request) => {
                if (
                    !request.isNavigationRequest() ||
                    request.frame() !== page?.mainFrame()
                )
                    return;
                const url = new URL(request.url());
                if (url.origin === origin || url.origin === ADMIN_ORIGIN)
                    visitedRoutes.add(
                        `${url.pathname}${url.search}${url.hash}`,
                    );
            });
            page.on("framenavigated", (frame) => {
                if (frame === page?.mainFrame()) {
                    const url = new URL(frame.url());
                    if (url.origin === origin || url.origin === ADMIN_ORIGIN)
                        visitedRoutes.add(
                            `${url.pathname}${url.search}${url.hash}`,
                        );
                }
            });
            page.on("console", (message) => {
                if (
                    message.type() === "error" &&
                    /form-action|Content Security Policy/.test(message.text())
                ) {
                    diagnostics.push(
                        "Browser reported a Content Security Policy rejection",
                    );
                }
            });
            page.setDefaultTimeout(20_000);
            const query = new URLSearchParams({
                ...recipe.query,
                review_case: recipe.id,
                review_flow: job.selection.flow,
                review_section: job.selection.section,
                theme: job.selection.theme,
            });
            await page.goto(
                `${screenOrigin(recipe.query.screen)}/flow-screen.html?${query}`,
                {
                    waitUntil: "domcontentloaded",
                },
            );
            if (
                recipe.action?.type === "sign-in" &&
                recipe.action.outcome === "provider-error"
            ) {
                stage = "opening the local provider handoff";
                await page
                    .getByRole("heading", {
                        name: "Local GitHub sign-in",
                        exact: true,
                    })
                    .waitFor();
                stage = "submitting the local provider failure";
                await page
                    .locator('button[name="decision"][value="continue"]')
                    .click();
                await page.waitForURL(
                    (url) => url.pathname !== "/__flow/identity",
                    { waitUntil: "domcontentloaded" },
                );
            }
            stage = "checking the expected page content";
            if (initialReviewSteps(recipe).length) {
                stage = "exercising the real controls";
                await page.waitForFunction(
                    () =>
                        document.documentElement.dataset.flowReviewComplete ||
                        document.documentElement.dataset.flowReviewError,
                );
                const failed = await page
                    .locator("html")
                    .getAttribute("data-flow-review-error");
                if (failed) {
                    stage += ` (${failed})`;
                    throw new Error("Review control unavailable");
                }
            }
            stage = "verifying the requested routes";
            const expectedFinalPath =
                recipe.finalRoute ??
                (recipe.action?.type === "sign-in" &&
                recipe.action.outcome === "provider-error"
                    ? "/error"
                    : entryRoute
                      ? new URL(entryRoute, origin).pathname
                      : "/flow-screen.html");
            await page.waitForURL((url) => url.pathname === expectedFinalPath, {
                waitUntil: "domcontentloaded",
                timeout: 20_000,
            });
            if (
                entryRoute &&
                !visitedRoutes.has(
                    new URL(entryRoute, origin).pathname +
                        new URL(entryRoute, origin).search +
                        new URL(entryRoute, origin).hash,
                )
            )
                throw new Error("Requested entry route was not loaded");
            const requestedFaults: ReviewRequest[] = [
                ...(recipe.requests ?? []),
                ...(recipe.steps ?? []).flatMap((step) => step.requests ?? []),
                ...(recipe.action?.type === "sign-in" &&
                recipe.action.outcome === "pending"
                    ? [
                          {
                              path: "/api/auth/sign-in/social",
                              method: "POST",
                              outcome: "pending" as const,
                          },
                      ]
                    : []),
            ];
            if (requestedFaults.length) {
                stage = "verifying every requested fault reached the product";
                // A loader can render before its effect sends the request.
                // Wait for transport evidence before judging the visible state.
                const deadline = Date.now() + 20_000;
                for (;;) {
                    const response = await runtime.fetch(
                        new Request(`${origin}/__flow/review/requests`),
                    );
                    if (!response.ok)
                        throw new Error("Request evidence unavailable");
                    const { consumed } = (await response.json()) as {
                        consumed: ReviewRequest[];
                    };
                    if (
                        requestedFaults.every((rule) =>
                            consumed.some(
                                (seen) =>
                                    seen.path === rule.path &&
                                    (seen.method ?? "GET") ===
                                        (rule.method ?? "GET") &&
                                    seen.outcome === rule.outcome,
                            ),
                        )
                    )
                        break;
                    if (Date.now() >= deadline)
                        throw new Error("Requested fault was not exercised");
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }
            }
            for (const expected of recipe.expected) {
                stage = `checking ${expected.text ?? expected.selector}`;
                let locator = page.locator(expected.selector);
                if (expected.text)
                    locator = locator.filter({ hasText: expected.text });
                await locator
                    .filter({ visible: true })
                    .first()
                    .waitFor({ state: "visible" });
            }
            if (
                recipe.query.screen === "device-consent" &&
                recipe.expected.some(
                    ({ selector }) => selector === "#authorize-dialog-title",
                )
            ) {
                stage = "checking the consent device code";
                const code = state.device?.userCode;
                if (
                    !code ||
                    new URL(page.url()).searchParams.get("user_code") !== code
                )
                    throw new Error(
                        "Consent does not match the prepared device request",
                    );
                await page
                    .getByText(`Code: ${code}`, { exact: true })
                    .waitFor({ state: "visible" });
            }
            const finalPath = new URL(page.url()).pathname;
            if (finalPath !== expectedFinalPath)
                throw new Error("Page changed after verifying the route");
            if (["/news", "/sign-in"].includes(finalPath)) {
                stage = "checking News highlights from the real feed";
                const news = page.locator('section:has(h2:text-is("News"))');
                // Announcements alone cannot prove that the dynamic feed loaded.
                await news.locator("p").first().waitFor({ state: "visible" });
                if (!highlightsResponse?.ok())
                    throw new Error("News feed did not load successfully");
                const highlights = parseHighlights(
                    await highlightsResponse.text(),
                ).slice(0, DYNAMIC_NEWS_COUNT);
                if (
                    !highlights.length ||
                    (await news.locator("p").count()) !== highlights.length
                )
                    throw new Error("News cards do not match the feed");
                for (const highlight of highlights) {
                    if (!highlight.title)
                        throw new Error("News highlight has no title");
                    await news
                        .getByText(highlight.title, { exact: true })
                        .waitFor({ state: "visible" });
                }
            }
            if (
                await page
                    .locator(
                        '#root[role="alert"], html[data-flow-bootstrap-error]',
                    )
                    .count()
            )
                throw new Error("Flow bootstrap failed");
            if (
                job.selection.flow === "device" &&
                recipe.id === "device-result"
            ) {
                stage = "verifying the device grant through Gen → Enter";
                const response = await runtime.fetch(
                    new Request(`${origin}/__flow/device/poll`, {
                        method: "POST",
                    }),
                );
                const state = (await response.json()) as {
                    device?: { status: string };
                };
                if (!response.ok || state.device?.status !== "completed")
                    throw new Error("Device grant verification failed");
            }
            if (
                recipe.action?.type === "sign-in" &&
                recipe.action.outcome !== "pending"
            ) {
                stage = "verifying the failed sign-in created no session";
                const outcome = (await (
                    await runtime.fetch(new Request(`${origin}/__flow/outcome`))
                ).json()) as { signIn: string };
                const state = (await (
                    await runtime.fetch(new Request(`${origin}/__flow/state`))
                ).json()) as { conditions: { account: string } };
                if (
                    outcome.signIn !== "normal" ||
                    state.conditions.account !== "signed-out" ||
                    (recipe.action.outcome === "provider-error" &&
                        session.callbackRequests !== 1)
                ) {
                    throw new Error(
                        "Expected a consumed provider failure and no session",
                    );
                }
            }
            await page.evaluate(async () => {
                await document.fonts.ready;
                if (document.documentElement.dataset.flowReviewError)
                    throw new Error("Review control unavailable");
            });
            stage = "loading the GitHub profile image";
            await page.waitForFunction(
                (source) =>
                    [...document.images]
                        .filter((image) => image.src === source)
                        .every(
                            (image) => image.complete && image.naturalWidth > 0,
                        ),
                githubProfile.avatar_url,
            );
            stage = "capturing the page";
            const png = await page.screenshot({
                type: "png",
                animations: "disabled",
                caret: "hide",
            });
            const html = await captureDocument(page);
            if (!current(job)) return;
            const image = `${endpoint}/image/${job.revision}/${encodeURIComponent(recipe.id)}`;
            images.set(image, png);
            const documentUrl = `${endpoint}/document/${job.revision}/${encodeURIComponent(recipe.id)}`;
            documents.set(documentUrl, html);
            job.result = {
                status: "ready",
                image,
                document: documentUrl,
                entryRoute: entryRoute
                    ? new URL(entryRoute, origin).pathname
                    : "/flow-screen.html",
                finalRoute: finalPath,
            };
        } catch {
            if (!current(job)) return;
            // Never expose browser errors or OAuth callback query strings.
            job.result = {
                status: "error",
                error: `Capture failed while ${stage}.${diagnostics.length ? ` ${diagnostics.slice(-8).join("; ")}` : ""}`,
            };
        } finally {
            await context?.close().catch(() => {});
            if (activeContext === context) activeContext = undefined;
        }
    }

    function processQueue() {
        if (processing || closed) return;
        processing = (async () => {
            while (queue.length && !closed) {
                const job = queue.shift();
                if (job && current(job)) {
                    activeJob = job;
                    try {
                        await capture(job);
                    } catch {
                        if (current(job)) {
                            job.result = {
                                status: "error",
                                error: "Capture runtime cleanup failed.",
                            };
                        }
                    } finally {
                        activeJob = undefined;
                    }
                }
            }
        })().finally(() => {
            processing = undefined;
            if (queue.length && !closed) processQueue();
        });
    }

    return {
        async fetch(request: Request): Promise<Response | null> {
            const url = new URL(request.url);
            if (
                url.pathname !== endpoint &&
                !url.pathname.startsWith(`${endpoint}/image/`) &&
                !url.pathname.startsWith(`${endpoint}/document/`)
            )
                return null;
            if (request.method !== "GET")
                return new Response(null, {
                    status: 405,
                    headers: { Allow: "GET" },
                });
            if (
                request.headers.get("origin") &&
                request.headers.get("origin") !== origin
            ) {
                return Response.json(
                    { error: "Local origin required" },
                    { status: 403 },
                );
            }
            if (url.pathname.startsWith(`${endpoint}/image/`)) {
                const png = images.get(url.pathname);
                return png
                    ? new Response(new Uint8Array(png), {
                          headers: {
                              "Content-Type": "image/png",
                              "Cache-Control":
                                  "private, max-age=31536000, immutable",
                          },
                      })
                    : new Response(null, { status: 404 });
            }
            if (url.pathname.startsWith(`${endpoint}/document/`)) {
                const html = documents.get(url.pathname);
                return html
                    ? new Response(html, {
                          headers: {
                              "Content-Type": "text/html; charset=utf-8",
                              "Cache-Control":
                                  "private, max-age=31536000, immutable",
                              "Content-Security-Policy":
                                  "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com; font-src 'self' data:; script-src 'none'; flow-src 'none'; form-action 'none'; base-uri 'self'; frame-ancestors 'self'",
                          },
                      })
                    : new Response(null, { status: 404 });
            }
            if (closed)
                return Response.json(
                    { error: "Preview service closed" },
                    { status: 503 },
                );
            const flow = url.searchParams.get("flow") ?? "app";
            const section = url.searchParams.get("section") ?? "main";
            let sourceVersion = version;
            let inventory = await options.loadCases();
            while (!closed && sourceVersion !== version) {
                sourceVersion = version;
                inventory = await options.loadCases();
            }
            if (closed)
                return Response.json(
                    { error: "Preview service closed" },
                    { status: 503 },
                );
            const available = inventory.reviewCasesForFlow(flow, section);
            if (!available.length) {
                return Response.json(
                    { error: "Unknown preview flow" },
                    { status: 400 },
                );
            }
            const theme = url.searchParams.get("theme") ?? "dark";
            const size = url.searchParams.get("size") ?? "mobile";
            if (
                (theme !== "dark" && theme !== "light") ||
                (size !== "mobile" && size !== "desktop")
            ) {
                return Response.json(
                    { error: "Invalid preview theme or size" },
                    { status: 400 },
                );
            }
            const requested = url.searchParams.has("cases")
                ? [
                      ...new Set(
                          (url.searchParams.get("cases") ?? "")
                              .split(",")
                              .filter(Boolean),
                      ),
                  ]
                : available.map((recipe) => recipe.id);
            const recipes = requested.map((id) =>
                available.find((recipe) => recipe.id === id),
            );
            if (recipes.some((recipe) => !recipe))
                return Response.json(
                    { error: "Unknown preview case" },
                    { status: 400 },
                );
            const selection: Selection = { flow, section, theme, size };
            const selectedJobs: Job[] = [];
            const cases: Record<string, PreviewCaseResult> = {};
            for (const recipe of recipes) {
                if (!recipe) continue;
                if (recipe.provider) {
                    cases[recipe.id] = {
                        status: "reference",
                        provider: recipe.provider,
                    };
                    continue;
                }
                const key = captureIdentity(recipe, selection);
                let job = jobs.get(key);
                if (!job) {
                    job = {
                        key,
                        version,
                        selection,
                        recipe,
                        revision: `${version}-${randomUUID()}`,
                        result: { status: "pending" },
                    };
                    jobs.set(key, job);
                    queue.push(job);
                }
                if (!selectedJobs.includes(job)) selectedJobs.push(job);
                cases[recipe.id] = job.result;
            }
            // A focused preview request overtakes queued section-wide verification.
            // Never interrupt the recipe already using the isolated database.
            if (url.searchParams.has("cases")) {
                const priority = selectedJobs.filter((job) =>
                    queue.includes(job),
                );
                for (const job of priority) queue.splice(queue.indexOf(job), 1);
                queue.unshift(...priority);
            }
            processQueue();
            const waiting = selectedJobs.filter(
                (job) => job.result.status === "pending",
            );
            const result: PreviewResult = {
                revision: String(version),
                status: waiting.length ? "loading" : "ready",
                stale: false,
                cases,
                ...(waiting.length && {
                    queue: {
                        position: Math.min(
                            ...waiting.map((job) =>
                                job === activeJob ? 0 : queue.indexOf(job) + 1,
                            ),
                        ),
                        total: queue.length + (activeJob ? 1 : 0),
                    },
                }),
            };
            return Response.json(result, {
                headers: { "Cache-Control": "no-store" },
            });
        },
        invalidate() {
            version++;
            queue.length = 0;
            jobs.clear();
            images.clear();
            documents.clear();
            void activeContext?.close().catch(() => {});
        },
        async close() {
            closed = true;
            queue.length = 0;
            await activeContext?.close().catch(() => {});
            await processing;
            await disposeResources();
            images.clear();
            documents.clear();
            jobs.clear();
        },
    };
}
