import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import type { D1Database } from "@cloudflare/workers-types";
import { createPollinationsAuth } from "@pollinations/auth/server";
import { build } from "esbuild";
import {
    CoreHeaders,
    Log,
    LogLevel,
    Miniflare,
    type MiniflareOptions,
    Request as WorkerRequest,
    type Response as WorkerResponse,
} from "miniflare";
import { buildCodeAgentModules } from "../../enter.pollinations.ai/scripts/code-agent-sdk.mjs";
import { parseConditions } from "./conditions-data";
import {
    ADMIN_CLIENT_ID,
    CLIENT_ID,
    readState,
    seedFixtures,
    sessionCookie,
    setConditions,
    syncLocalIdentity,
    TEST_AUTH_SECRET,
    TEST_DASHBOARD_SECRET,
} from "./fixtures.ts";
import { createLocalProvider } from "./local-provider";
import { prepareDashboardReview } from "./review-dashboard-fixtures";
import { createReviewRequests, type LoadReviewErrors } from "./review-requests";
import { createReviewServices } from "./review-services";
import { parseReviewSetup, prepareReviewData } from "./review-setup";

const directory = fileURLToPath(new URL(".", import.meta.url));
const repository = path.resolve(directory, "../..");
const ENTER_ORIGIN = "http://localhost:4180";

async function workerRequest(request: Request, url: URL, isGen = false) {
    const headers = new Headers(request.headers);
    // Undici rewrites Sec-Fetch-Mode to cors. Miniflare restores this native
    // navigation metadata before Enter decides between JSON and redirects.
    const fetchMode = headers.get("sec-fetch-mode");
    if (fetchMode) headers.set(CoreHeaders.SEC_FETCH_MODE, fetchMode);
    // Production Gen cannot receive Enter's host-only session cookie. Keep
    // that boundary when both services share the harness's localhost origin.
    if (isGen) headers.delete("cookie");
    return new WorkerRequest(url, {
        method: request.method,
        headers: [...headers],
        body: ["GET", "HEAD"].includes(request.method)
            ? undefined
            : await request.arrayBuffer(),
        redirect: "manual",
    });
}

async function bundleWorker(service: string) {
    const result = await build({
        absWorkingDir: repository,
        entryPoints: [`${service}/src/index.ts`],
        tsconfig: `${service}/tsconfig.json`,
        bundle: true,
        write: false,
        format: "esm",
        platform: "browser",
        conditions: ["workerd", "worker"],
        target: "es2022",
        external: ["node:*", "cloudflare:*"],
        alias: { "piexif-ts": "piexif-ts/dist/piexif.js" },
        logLevel: "silent",
        plugins: [
            {
                name: "code-agent-sdk",
                setup(builder) {
                    builder.onResolve(
                        { filter: /^virtual:code-agent-sdk$/ },
                        (args) => ({
                            path: args.path,
                            namespace: "code-agent-sdk",
                        }),
                    );
                    builder.onLoad(
                        { filter: /.*/, namespace: "code-agent-sdk" },
                        async () => {
                            const { runtimeModule, sdkModules } =
                                await buildCodeAgentModules();
                            return {
                                contents: `export const runtimeModule = ${JSON.stringify(runtimeModule)};
export const sdkModules = ${JSON.stringify(sdkModules)};`,
                                loader: "js",
                            };
                        },
                    );
                },
            },
            {
                name: "worker-markdown",
                setup(builder) {
                    builder.onResolve({ filter: /\?raw$/ }, (args) => ({
                        path: path.resolve(
                            args.resolveDir,
                            args.path.slice(0, -4),
                        ),
                        namespace: "worker-markdown",
                    }));
                    builder.onLoad(
                        { filter: /.*/, namespace: "worker-markdown" },
                        async (args) => ({
                            contents: await readFile(args.path, "utf8"),
                            loader: "text",
                        }),
                    );
                },
            },
        ],
    });
    return result.outputFiles[0].text;
}

async function migrate(db: D1Database) {
    await db
        .prepare(`CREATE TABLE IF NOT EXISTS connect_migrations
        (name TEXT PRIMARY KEY)`)
        .run();
    const migrations = await readD1Migrations(
        path.join(repository, "enter.pollinations.ai/drizzle"),
    );
    for (const migration of migrations) {
        const applied = await db
            .prepare("SELECT name FROM connect_migrations WHERE name = ?")
            .bind(migration.name)
            .first();
        if (applied) continue;
        await db.batch([
            ...migration.queries.map((query) => db.prepare(query)),
            db
                .prepare("INSERT INTO connect_migrations (name) VALUES (?)")
                .bind(migration.name),
        ]);
    }
    await db
        .prepare(`CREATE TABLE IF NOT EXISTS connect_conditions
        (id INTEGER PRIMARY KEY CHECK (id = 1), account TEXT NOT NULL,
         pollen TEXT NOT NULL, allowance TEXT NOT NULL,
         role TEXT NOT NULL DEFAULT 'member')`)
        .run();
    const columns = await db
        .prepare("PRAGMA table_info(connect_conditions)")
        .all<{ name: string }>();
    if (!columns.results.some((column) => column.name === "role")) {
        await db
            .prepare(
                "ALTER TABLE connect_conditions ADD COLUMN role TEXT NOT NULL DEFAULT 'member'",
            )
            .run();
    }
    await db
        .prepare(`CREATE TABLE IF NOT EXISTS connect_device
        (id INTEGER PRIMARY KEY CHECK (id = 1), device_code TEXT NOT NULL,
         user_code TEXT NOT NULL, verification_uri TEXT NOT NULL,
         verification_uri_complete TEXT NOT NULL, status TEXT NOT NULL)`)
        .run();
}

export async function bundleWorkers() {
    const [enter, gen] = await Promise.all([
        bundleWorker("enter.pollinations.ai"),
        bundleWorker("gen.pollinations.ai"),
    ]);
    return { enter, gen };
}

type WorkerScripts = Awaited<ReturnType<typeof bundleWorkers>>;

export async function startRuntime(
    options: {
        persist?: boolean;
        scripts?: WorkerScripts;
        loadReviewErrors?: LoadReviewErrors;
    } = {},
) {
    const pendingBodies = new Set<(reason?: unknown) => Promise<void>>();
    function webResponse(response: WorkerResponse) {
        const reader = response.body?.getReader();
        const cancel = (reason?: unknown) => {
            pendingBodies.delete(cancel);
            return reader?.cancel(reason) ?? Promise.resolve();
        };
        if (reader) pendingBodies.add(cancel);
        const body = reader
            ? new ReadableStream<Uint8Array>({
                  async pull(controller) {
                      try {
                          const chunk = await reader.read();
                          if (chunk.done) {
                              pendingBodies.delete(cancel);
                              controller.close();
                          } else controller.enqueue(chunk.value);
                      } catch (error) {
                          pendingBodies.delete(cancel);
                          controller.error(error);
                      }
                  },
                  cancel,
              })
            : null;
        const headers = new Headers();
        response.headers.forEach((value, key) => {
            if (key !== "set-cookie") headers.set(key, value);
        });
        for (const cookie of response.headers.getSetCookie())
            headers.append("set-cookie", cookie);
        return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }

    const localProvider = createLocalProvider();
    const reviewRequests = createReviewRequests(options.loadReviewErrors);
    const reviewServices = createReviewServices();
    const scripts = options.scripts ?? (await bundleWorkers());
    // No Wrangler environment files or service deployment config are loaded.
    // These are the checked-in Workers test placeholders, not provider access.
    const bindings = {
        ENVIRONMENT: "test",
        NODE_ENV: "test",
        LOG_LEVEL: "error",
        LOG_FORMAT: "text",
        BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
        BETTER_AUTH_URL: ENTER_ORIGIN,
        GEN_BASE_URL: `${ENTER_ORIGIN}/gen`,
        GITHUB_CLIENT_ID: "test_github_client_id",
        DISCORD_CLIENT_ID: "invalid-local-review-placeholder",
        DISCORD_CLIENT_SECRET: "invalid-local-review-placeholder",
        DISCORD_BOT_TOKEN: "invalid-local-review-placeholder",
        GITHUB_CLIENT_SECRET: "test_github_client_secret",
        PLN_ENTER_TOKEN: "test-admin-token-at-least-32-characters",
        STRIPE_MODE: "sandbox",
        STRIPE_SECRET_KEY: "sk_test_not_a_real_key_workers_test_only",
        STRIPE_WEBHOOK_SECRET: "whsec_not_a_real_secret_workers_test_only",
        TINYBIRD_INGEST_URL:
            "http://localhost:7181/v0/events?name=generation_event_v2",
        TINYBIRD_INGEST_TOKEN: "test_tinybird_ingest_token",
        TINYBIRD_READ_TOKEN: "invalid-local-review-placeholder",
    };
    const common = {
        compatibilityDate: "2025-11-01",
        compatibilityFlags: ["nodejs_compat", "nodejs_als"],
        bindings,
        d1Databases: { DB: "connect-local-isolated-db" },
        kvNamespaces: { KV: "connect-local-isolated-kv" },
        // Enter owns auth and product logic. Named external-service fixtures
        // stay local; requests outside their scope remain unavailable.
        outboundService: async (request: Request) =>
            (await reviewServices.outbound(request)) ??
            localProvider.outbound(request),
    };
    const workerOptions = (scripts: WorkerScripts): MiniflareOptions => ({
        host: "127.0.0.1",
        port: 0,
        log: new Log(LogLevel.ERROR),
        defaultPersistRoot: path.join(directory, ".local"),
        d1Persist: options.persist !== false,
        kvPersist: options.persist !== false,
        cachePersist: false,
        r2Persist: false,
        durableObjectsPersist: false,
        workers: [
            {
                ...common,
                name: "connect-enter",
                serviceBindings: { COMPOSIO_MCP: reviewServices.integrations },
                modules: [
                    {
                        type: "ESModule",
                        path: "enter.mjs",
                        contents: scripts.enter,
                    },
                ],
            },
            {
                ...common,
                name: "connect-gen",
                modules: [
                    {
                        type: "ESModule",
                        path: "gen.mjs",
                        contents: scripts.gen,
                    },
                ],
                serviceBindings: { ENTER: "connect-enter" },
                r2Buckets: ["IMAGE_BUCKET", "TEXT_BUCKET"],
                durableObjects: {
                    POLLEN_RATE_LIMITER: "PollenRateLimiter",
                    COMMUNITY_MODEL_RATE_LIMITER: "CommunityModelRateLimiter",
                    GENERATION_COORDINATOR: {
                        className: "GenerationCoordinator",
                        useSQLite: true,
                    },
                },
            },
        ],
    });
    const mf = new Miniflare(workerOptions(scripts));
    try {
        console.log("Connect: starting isolated Workers");
        let db = (await mf.getD1Database("DB", "connect-enter")) as D1Database;
        console.log("Connect: applying local database migrations");
        await migrate(db);
        await syncLocalIdentity(db);
        let enter = await mf.getWorker("connect-enter");
        let gen = await mf.getWorker("connect-gen");
        let ready = Promise.resolve();
        const adminAuth = createPollinationsAuth({
            clientId: ADMIN_CLIENT_ID,
            sessionSecret: TEST_DASHBOARD_SECRET,
            baseUrl: ENTER_ORIGIN,
            fetch: async (input, init) => {
                const request = new Request(input, init);
                const url = new URL(request.url);
                if (
                    url.origin !== ENTER_ORIGIN ||
                    !url.pathname.startsWith("/api/auth/oauth2/")
                ) {
                    throw new Error("Local Enter OAuth issuer required");
                }
                return webResponse(
                    await enter.fetch(await workerRequest(request, url)),
                );
            },
        });

        async function fetch(request: Request): Promise<Response> {
            const url = new URL(request.url);
            if (url.pathname.startsWith("/__connect/")) {
                const origin = request.headers.get("origin");
                if (origin && origin !== ENTER_ORIGIN) {
                    return Response.json(
                        { error: "Local origin required" },
                        { status: 403 },
                    );
                }
                try {
                    // Opening a view selects the existing session cookie without
                    // changing account data, review services or injected faults.
                    let establishSession =
                        url.pathname === "/__connect/state" &&
                        request.method === "GET";
                    let clearAdminSession = false;
                    const initialized = await db
                        .prepare(
                            "SELECT id FROM connect_conditions WHERE id = 1",
                        )
                        .first();
                    if (!initialized && url.pathname !== "/__connect/reset") {
                        return Response.json(
                            {
                                error: "Run the local fixture reset to initialize Connect",
                            },
                            { status: 409 },
                        );
                    }
                    if (url.pathname === "/__connect/identity")
                        return localProvider.handoff(request);
                    if (
                        url.pathname === "/__connect/review/requests" &&
                        request.method === "GET"
                    )
                        return Response.json(reviewRequests.evidence(), {
                            headers: { "Cache-Control": "no-store" },
                        });
                    if (
                        url.pathname === "/__connect/review/requests" &&
                        request.method === "POST"
                    ) {
                        reviewRequests.configure(await request.json());
                        return Response.json({ configured: true });
                    }
                    if (url.pathname === "/__connect/outcome") {
                        if (request.method === "GET")
                            return Response.json(localProvider.outcome(), {
                                headers: { "Cache-Control": "no-store" },
                            });
                        if (request.method === "POST")
                            return Response.json(
                                localProvider.setOutcome(await request.json()),
                                {
                                    headers: { "Cache-Control": "no-store" },
                                },
                            );
                        return new Response("Method not allowed", {
                            status: 405,
                        });
                    }
                    if (
                        url.pathname === "/__connect/reset" &&
                        request.method === "POST"
                    ) {
                        const kv = await mf.getKVNamespace(
                            "KV",
                            "connect-enter",
                        );
                        const entries = await kv.list();
                        await Promise.all(
                            entries.keys.map(({ name }) => kv.delete(name)),
                        );
                        await seedFixtures(db, kv);
                        reviewRequests.reset();
                        reviewServices.configure({});
                        establishSession = true;
                        clearAdminSession = true;
                    } else if (
                        url.pathname === "/__connect/conditions" &&
                        request.method === "POST"
                    ) {
                        const patch = {
                            ...parseConditions(await request.json()),
                        };
                        reviewRequests.configure([]);
                        const current = (await readState(db)).conditions;
                        // Re-selecting the current auth condition must not
                        // recreate Enter's session or sign the admin out.
                        if (patch.account === current.account)
                            delete patch.account;
                        if (patch.role === current.role) delete patch.role;
                        if (Object.keys(patch).length)
                            await setConditions(db, patch);
                        await prepareReviewData(db, {});
                        reviewServices.configure({});
                        // Select the existing local session in a newly opened
                        // browser as well. Only setConditions(account) creates
                        // a session; an empty patch reuses its signed cookie.
                        establishSession = true;
                        clearAdminSession =
                            patch.account !== undefined ||
                            patch.role !== undefined;
                    } else if (
                        url.pathname === "/__connect/review/prepare" &&
                        request.method === "POST"
                    ) {
                        const setup = parseReviewSetup(await request.json());
                        if (setup.dashboard)
                            await prepareDashboardReview(
                                db,
                                setup.dashboard as "populated" | "empty",
                            );
                        await prepareReviewData(db, setup);
                        reviewServices.configure(setup);
                        if (setup.device) {
                            const started = await fetch(
                                new Request(
                                    `${ENTER_ORIGIN}/__connect/device/start`,
                                    { method: "POST" },
                                ),
                            );
                            if (!started.ok)
                                throw new Error(
                                    "Could not prepare device request",
                                );
                            if (setup.device === "missing-app")
                                await db
                                    .prepare(
                                        "UPDATE device_code SET client_id = 'pk_connect_missing_app' WHERE device_code = (SELECT device_code FROM connect_device WHERE id = 1)",
                                    )
                                    .run();
                            if (setup.device === "expired")
                                await db
                                    .prepare(
                                        "UPDATE device_code SET expires_at = ? WHERE device_code = (SELECT device_code FROM connect_device WHERE id = 1)",
                                    )
                                    .bind(Math.floor(Date.now() / 1000) - 1)
                                    .run();
                            if (setup.device === "used")
                                await db
                                    .prepare(
                                        "UPDATE device_code SET status = 'denied' WHERE device_code = (SELECT device_code FROM connect_device WHERE id = 1)",
                                    )
                                    .run();
                        }
                    } else if (
                        url.pathname === "/__connect/device/start" &&
                        request.method === "POST"
                    ) {
                        const response = await enter.fetch(
                            new WorkerRequest(
                                `${ENTER_ORIGIN}/api/device/code`,
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        client_id: CLIENT_ID,
                                        scope: "generate profile usage",
                                    }),
                                },
                            ),
                        );
                        if (!response.ok)
                            throw new Error(
                                `Device start failed (${response.status})`,
                            );
                        const grant = (await response.json()) as {
                            device_code: string;
                            user_code: string;
                            verification_uri: string;
                            verification_uri_complete: string;
                        };
                        await db
                            .prepare(`INSERT OR REPLACE INTO connect_device
                                (id, device_code, user_code, verification_uri,
                                 verification_uri_complete, status)
                                VALUES (1, ?, ?, ?, ?, 'pending')`)
                            .bind(
                                grant.device_code,
                                grant.user_code,
                                grant.verification_uri,
                                grant.verification_uri_complete,
                            )
                            .run();
                    } else if (
                        url.pathname === "/__connect/device/poll" &&
                        request.method === "POST"
                    ) {
                        const device = await db
                            .prepare(
                                "SELECT device_code, status FROM connect_device WHERE id = 1",
                            )
                            .first<{ device_code: string; status: string }>();
                        if (!device)
                            throw new Error("Start a device connection first");
                        if (device.status !== "completed") {
                            const response = await enter.fetch(
                                new WorkerRequest(
                                    `${ENTER_ORIGIN}/api/oauth/token`,
                                    {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                            grant_type:
                                                "urn:ietf:params:oauth:grant-type:device_code",
                                            device_code: device.device_code,
                                            client_id: CLIENT_ID,
                                        }),
                                    },
                                ),
                            );
                            const token = (await response.json()) as {
                                access_token?: string;
                                error?: string;
                            };
                            if (response.ok && token.access_token) {
                                // Exercise the granted credential through real Gen → Enter,
                                // then discard it. Only the real key's hash remains in D1.
                                const key = await gen.fetch(
                                    new WorkerRequest(
                                        `${ENTER_ORIGIN}/account/key`,
                                        {
                                            headers: {
                                                authorization: `Bearer ${token.access_token}`,
                                            },
                                        },
                                    ),
                                );
                                await key.body?.cancel();
                                if (!key.ok)
                                    throw new Error(
                                        `Device key verification failed (${key.status})`,
                                    );
                                await db
                                    .prepare(
                                        "UPDATE connect_device SET status = 'completed' WHERE id = 1 AND device_code = ?",
                                    )
                                    .bind(device.device_code)
                                    .run();
                            } else if (
                                ![
                                    "authorization_pending",
                                    "access_denied",
                                    "expired_token",
                                    "invalid_grant",
                                ].includes(token.error ?? "")
                            ) {
                                throw new Error(
                                    `Device poll failed (${response.status})`,
                                );
                            }
                        }
                    } else if (
                        !(
                            url.pathname === "/__connect/state" &&
                            request.method === "GET"
                        )
                    ) {
                        return Response.json(
                            { error: "Not found" },
                            { status: 404 },
                        );
                    }
                    const state = await readState(db);
                    const headers = new Headers({
                        "Cache-Control": "no-store",
                    });
                    if (establishSession) {
                        headers.append(
                            "Set-Cookie",
                            await sessionCookie(db, state.conditions.account),
                        );
                    }
                    if (clearAdminSession) {
                        // Use the real handler's cookie names and deletion behavior.
                        // Role changes should not wait for its 60-second revalidation.
                        const logout = await adminAuth.handle(
                            new Request(`${ENTER_ORIGIN}/auth/logout`, {
                                method: "POST",
                                headers: { Origin: ENTER_ORIGIN },
                            }),
                        );
                        for (const cookie of logout?.headers.getSetCookie() ??
                            []) {
                            headers.append("Set-Cookie", cookie);
                        }
                    }
                    return Response.json(state, {
                        headers,
                    });
                } catch (error) {
                    return Response.json(
                        {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : "Local operation failed",
                        },
                        { status: 400 },
                    );
                }
            }
            const reviewResponse = await reviewRequests.intercept(request);
            if (reviewResponse) return reviewResponse;
            if (url.pathname.startsWith("/auth/")) {
                const response = await adminAuth.handle(request);
                if (response) {
                    const location = response.headers.get("Location");
                    if (location) {
                        const target = new URL(location, url.origin);
                        // The package owns authentication; this host owns the
                        // location of its example page within the shared origin.
                        if (
                            target.origin === url.origin &&
                            target.pathname === "/"
                        ) {
                            target.pathname = "/connect-admin.html";
                            response.headers.set("Location", target.href);
                        }
                    }
                    return response;
                }
            }
            if (url.pathname.startsWith("/gen/")) {
                url.pathname = url.pathname.slice(4);
                return webResponse(
                    await gen.fetch(await workerRequest(request, url, true)),
                );
            }
            if (
                url.pathname.startsWith("/api/") ||
                url.pathname.startsWith("/.well-known/")
            ) {
                const startsSignIn =
                    url.pathname === "/api/auth/sign-in/social" &&
                    request.method === "POST";
                if (startsSignIn && localProvider.takeStartFailure())
                    return Response.json(
                        { message: "Local sign-in request failed. Try again." },
                        {
                            status: 503,
                            headers: { "Cache-Control": "no-store" },
                        },
                    );
                // Use Miniflare's HTTP entry here; its RPC fetch proxy does
                // not restore native navigation metadata.
                const response = webResponse(
                    await mf.dispatchFetch(await workerRequest(request, url)),
                );
                return startsSignIn
                    ? localProvider.rewriteSignIn(response)
                    : response;
            }
            return Response.json({ error: "Not found" }, { status: 404 });
        }
        return {
            async fetch(request: Request) {
                await ready;
                return fetch(request);
            },
            reload(scripts: WorkerScripts) {
                ready = ready
                    .catch(() => {})
                    .then(async () => {
                        await Promise.allSettled(
                            [...pendingBodies].map((cancel) => cancel()),
                        );
                        await mf.setOptions(workerOptions(scripts));
                        // Miniflare invalidates binding stubs on reload. The data,
                        // service fixtures and pending fault rules stay in place.
                        db = (await mf.getD1Database(
                            "DB",
                            "connect-enter",
                        )) as D1Database;
                        await migrate(db);
                        enter = await mf.getWorker("connect-enter");
                        gen = await mf.getWorker("connect-gen");
                    });
                return ready;
            },
            dispose: async () => {
                reviewRequests.configure([]);
                // A review may stop while a streamed response is still unread.
                // Release those connections before Miniflare closes its dispatcher.
                await Promise.allSettled(
                    [...pendingBodies].map((cancel) => cancel()),
                );
                await mf.dispose();
            },
        };
    } catch (error) {
        await mf.dispose();
        throw error;
    }
}
