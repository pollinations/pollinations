import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import {
    type Browser,
    type BrowserContext,
    chromium,
    type Page,
} from "playwright";
import { captureDocument } from "./capture-document";
import type { PreviewResult } from "./capture-types";
import type { ReviewCase } from "./review-cases";
import { prepareReviewCase } from "./review-prepare";
import type { startRuntime } from "./runtime";

const origin = "http://localhost:4180";
const endpoint = "/__connect/previews";
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
    result: PreviewResult;
};

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

    function pruneImages() {
        const referenced = new Set(
            [...jobs.values()].flatMap((job) =>
                Object.values(job.result.cases).flatMap((entry) =>
                    [entry.image, entry.document].filter((url): url is string =>
                        Boolean(url),
                    ),
                ),
            ),
        );
        for (const image of images.keys()) {
            if (!referenced.has(image)) images.delete(image);
        }
        for (const document of documents.keys()) {
            if (!referenced.has(document)) documents.delete(document);
        }
    }

    async function capture(job: Job) {
        const label = `${job.selection.flow}/${job.selection.section}`;
        console.info(`Connect previews: starting ${label}`);
        let runtime: Awaited<ReturnType<typeof startRuntime>> | undefined;
        let browser: Browser | undefined;
        let transport: ReturnType<typeof serve> | undefined;
        let stage = "loading capture recipes";
        try {
            // Vite reloads the recipes with the same source version as the pages.
            const inventory = await options.loadCases();
            const recipes = inventory.reviewCasesForFlow(
                job.selection.flow,
                job.selection.section,
            );
            if (!current(job)) return;
            for (const recipe of recipes) {
                job.result.cases[recipe.id] = {
                    status: "pending",
                    ...(job.result.cases[recipe.id]?.image && {
                        image: job.result.cases[recipe.id].image,
                    }),
                    ...(job.result.cases[recipe.id]?.document && {
                        document: job.result.cases[recipe.id].document,
                    }),
                };
            }
            stage = "starting the disposable local services";
            const createRuntime = await options.loadRuntime();
            runtime = await createRuntime({ persist: false });
            if (!current(job)) return;
            const isolatedRuntime = runtime;
            let callbackRequests = 0;
            transport = serve({
                async fetch(request) {
                    const url = new URL(request.url);
                    if (url.origin !== origin)
                        return new Response("Local capture origin required", {
                            status: 403,
                        });
                    if (
                        /^\/(?:api|gen|__connect|auth|\.well-known)(?:\/|$)/.test(
                            url.pathname,
                        )
                    ) {
                        if (url.pathname === "/api/auth/callback/github")
                            callbackRequests++;
                        return isolatedRuntime.fetch(request);
                    }
                    if (!["GET", "HEAD"].includes(request.method))
                        return new Response("Source files are read-only", {
                            status: 405,
                        });
                    const headers = new Headers(request.headers);
                    headers.delete("cookie");
                    headers.delete("authorization");
                    return fetch(request.url, {
                        method: request.method,
                        headers,
                        redirect: "manual",
                    });
                },
                hostname: "127.0.0.1",
                port: 0,
            });
            await once(transport, "listening");
            const transportOrigin = `http://127.0.0.1:${(transport.address() as AddressInfo).port}`;
            stage = "starting Chromium";
            // A real proxy covers every native redirect hop. Playwright routes
            // only intercept the first URL of a redirect chain.
            browser = await chromium.launch({
                headless: true,
                proxy: { server: transportOrigin, bypass: "<-loopback>" },
            });
            for (const recipe of recipes) {
                if (!current(job)) return;
                callbackRequests = 0;
                let context: BrowserContext | undefined;
                let page: Page | undefined;
                const diagnostics: string[] = [];
                stage = "preparing the isolated account";
                try {
                    const preparedRuntime = runtime;
                    const changed = await prepareReviewCase(
                        recipe,
                        (path, body) =>
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
                    context = await browser.newContext({
                        viewport: viewports[job.selection.size],
                        colorScheme: job.selection.theme,
                        deviceScaleFactor: 1,
                        serviceWorkers: "block",
                    });
                    activeContext = context;
                    context.on("response", async (response) => {
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
                                    "/__connect/identity",
                                    "/api/auth/callback/github",
                                ].includes(path)
                            ) {
                                diagnostics.push(`${request.method()} ${path}`);
                                if (request.method() === "POST") {
                                    const requestOrigin =
                                        request.headers().origin;
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
                                    "/__connect/identity",
                                    "/api/auth/callback/github",
                                ].includes(path)
                            )
                                diagnostics.push(
                                    `${response.status()} ${path}`,
                                );
                        });
                    }
                    // Install only the real fixture cookie returned by this
                    // disposable runtime. Never copy the Journey browser session.
                    const sessionCookie = changed.headers
                        .getSetCookie()
                        .find(
                            (cookie) =>
                                cookie.startsWith(
                                    "better-auth.session_token=",
                                ) && !cookie.includes("Max-Age=0"),
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
                            if (url.origin !== origin) {
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
                    page.on("console", (message) => {
                        if (
                            message.type() === "error" &&
                            /form-action|Content Security Policy/.test(
                                message.text(),
                            )
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
                        theme: job.selection.theme,
                    });
                    await page.goto(
                        `${origin}/pollen-connect-screen.html?${query}`,
                        { waitUntil: "domcontentloaded" },
                    );
                    if (recipe.action?.type === "sign-in") {
                        if (
                            recipe.pageId === "enter-signed-out" &&
                            job.selection.size === "mobile"
                        )
                            await page
                                .getByRole("button", {
                                    name: "Open navigation",
                                    exact: true,
                                })
                                .click();
                        await page
                            .getByRole("button", {
                                name: "Sign in with GitHub",
                                exact: true,
                            })
                            .first()
                            .click();
                        if (recipe.action.outcome === "provider-error") {
                            stage = "opening the local provider handoff";
                            await page
                                .getByRole("heading", {
                                    name: "Local GitHub sign-in",
                                    exact: true,
                                })
                                .waitFor();
                            stage = "submitting the local provider failure";
                            await page
                                .getByRole("button", {
                                    name: "Continue as pollinations agent",
                                    exact: true,
                                })
                                .click();
                            await page.waitForURL(
                                (url) => url.pathname !== "/__connect/identity",
                                { waitUntil: "domcontentloaded" },
                            );
                        }
                    }
                    if (recipe.action?.type === "device-deny") {
                        await page.locator("#authorize-dialog-title").waitFor();
                        await page
                            .getByRole("button", {
                                name: "Cancel",
                                exact: true,
                            })
                            .click();
                    }
                    stage = "checking the expected page content";
                    if (recipe.steps) {
                        stage = "exercising the real controls";
                        await page.waitForFunction(
                            () =>
                                document.documentElement.dataset
                                    .connectReviewComplete ||
                                document.documentElement.dataset
                                    .connectReviewError,
                        );
                        const failed = await page
                            .locator("html")
                            .getAttribute("data-connect-review-error");
                        if (failed) {
                            stage += ` (${failed})`;
                            throw new Error("Review control unavailable");
                        }
                    }
                    for (const expected of recipe.expected) {
                        stage = `checking ${expected.text ?? expected.selector}`;
                        let locator = page.locator(expected.selector);
                        if (expected.text)
                            locator = locator.filter({
                                hasText: expected.text,
                            });
                        await locator
                            .filter({ visible: true })
                            .first()
                            .waitFor({ state: "visible" });
                    }
                    if (
                        job.selection.flow === "device" &&
                        recipe.id === "device-result"
                    ) {
                        stage =
                            "verifying the device grant through Gen → Enter";
                        const response = await runtime.fetch(
                            new Request(`${origin}/__connect/device/poll`, {
                                method: "POST",
                            }),
                        );
                        const state = (await response.json()) as {
                            device?: { status: string };
                        };
                        if (
                            !response.ok ||
                            state.device?.status !== "completed"
                        )
                            throw new Error("Device grant verification failed");
                    }
                    if (
                        recipe.action?.type === "sign-in" &&
                        recipe.action.outcome !== "pending"
                    ) {
                        stage =
                            "verifying the failed sign-in created no session";
                        const outcome = (await (
                            await runtime.fetch(
                                new Request(`${origin}/__connect/outcome`),
                            )
                        ).json()) as { signIn: string };
                        const state = (await (
                            await runtime.fetch(
                                new Request(`${origin}/__connect/state`),
                            )
                        ).json()) as { conditions: { account: string } };
                        if (
                            outcome.signIn !== "normal" ||
                            state.conditions.account !== "signed-out" ||
                            (recipe.action.outcome === "provider-error" &&
                                callbackRequests !== 1)
                        ) {
                            throw new Error(
                                "Expected a consumed provider failure and no session",
                            );
                        }
                    }
                    await page.evaluate(async () => {
                        await document.fonts.ready;
                        if (document.documentElement.dataset.connectReviewError)
                            throw new Error("Review control unavailable");
                    });
                    stage = "capturing the page";
                    const png = await page.screenshot({
                        type: "png",
                        animations: "disabled",
                        caret: "hide",
                    });
                    const html = await captureDocument(page);
                    if (!current(job)) return;
                    const image = `${endpoint}/image/${job.result.revision}/${encodeURIComponent(recipe.id)}`;
                    images.set(image, png);
                    const documentUrl = `${endpoint}/document/${job.result.revision}/${encodeURIComponent(recipe.id)}`;
                    documents.set(documentUrl, html);
                    job.result.cases[recipe.id] = {
                        status: "ready",
                        image,
                        document: documentUrl,
                    };
                } catch {
                    if (!current(job)) return;
                    // Browser errors may contain callback URLs. Only report the
                    // stage and public case identifier, never raw errors/requests.
                    job.result.cases[recipe.id] = {
                        ...job.result.cases[recipe.id],
                        status: "error",
                        error: `Capture failed while ${stage}.${diagnostics.length ? ` ${diagnostics.slice(-8).join("; ")}` : ""}`,
                    };
                } finally {
                    await context?.close().catch(() => {});
                    if (activeContext === context) activeContext = undefined;
                }
            }
        } catch {
            if (current(job)) {
                job.result.status = "error";
                job.result.error = `Previews unavailable while ${stage}.`;
            }
        } finally {
            try {
                await browser?.close();
            } finally {
                try {
                    if (transport) {
                        await new Promise<void>((resolve) => {
                            transport?.close(() => resolve());
                            // Stop accepting sockets before closing existing ones.
                            if (transport && "closeAllConnections" in transport)
                                transport.closeAllConnections();
                        });
                    }
                } finally {
                    await runtime?.dispose();
                    console.info(`Connect previews: disposed ${label}`);
                }
            }
            pruneImages();
        }
        if (current(job) && job.result.status !== "error") {
            job.result.status = "ready";
            job.result.stale = Object.values(job.result.cases).some(
                (entry) => entry.status !== "ready" && Boolean(entry.image),
            );
        }
    }

    function processQueue() {
        if (processing || closed) return;
        processing = (async () => {
            while (queue.length && !closed) {
                const job = queue.shift();
                if (job && current(job)) {
                    try {
                        await capture(job);
                    } catch {
                        if (current(job)) {
                            job.result.status = "error";
                            job.result.error =
                                "Capture runtime cleanup failed.";
                        }
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
                                  "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'self'; frame-ancestors 'self'",
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
            const inventory = await options.loadCases();
            if (!inventory.reviewCasesForFlow(flow, section).length) {
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
            try {
                const selection: Selection = { flow, section, theme, size };
                const key = JSON.stringify(selection);
                let job = jobs.get(key);
                if (!job || job.version !== version) {
                    const previous = job;
                    job = {
                        key,
                        version,
                        selection,
                        result: {
                            revision: `${version}-${randomUUID()}`,
                            status: "loading",
                            stale: Boolean(previous),
                            cases: Object.fromEntries(
                                Object.entries(
                                    previous?.result.cases ?? {},
                                ).map(([id, entry]) => [
                                    id,
                                    {
                                        status: "pending",
                                        ...(entry.image && {
                                            image: entry.image,
                                        }),
                                        ...(entry.document && {
                                            document: entry.document,
                                        }),
                                    },
                                ]),
                            ),
                        },
                    };
                    jobs.delete(key);
                    jobs.set(key, job);
                    while (jobs.size > 12) {
                        const oldest = jobs.keys().next().value;
                        if (oldest !== undefined) jobs.delete(oldest);
                    }
                    for (let index = queue.length - 1; index >= 0; index--) {
                        if (!current(queue[index])) queue.splice(index, 1);
                    }
                    queue.push(job);
                    processQueue();
                }
                return Response.json(job.result, {
                    headers: { "Cache-Control": "no-store" },
                });
            } catch {
                return Response.json(
                    { error: "Preview unavailable" },
                    { status: 400 },
                );
            }
        },
        invalidate() {
            version++;
            queue.length = 0;
            void activeContext?.close().catch(() => {});
        },
        async close() {
            closed = true;
            queue.length = 0;
            await activeContext?.close().catch(() => {});
            await processing;
            images.clear();
            documents.clear();
            jobs.clear();
        },
    };
}
