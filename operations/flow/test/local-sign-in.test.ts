import { afterAll, beforeAll, expect, test } from "vitest";
import { localIdentity, USER_ID } from "../fixtures";
import { startRuntime } from "../runtime";

// Integration tests create real sessions in an isolated database. Run this
// file explicitly when local authentication verification is authorized.
const origin = "http://localhost:4180";
let runtime: Awaited<ReturnType<typeof startRuntime>>;
const cookies = new Map<string, string>();

async function request(
    path: string,
    body?: Record<string, unknown> | URLSearchParams,
) {
    const form = body instanceof URLSearchParams;
    const response = await runtime.fetch(
        new Request(new URL(path, origin), {
            method: body === undefined ? "GET" : "POST",
            headers: {
                Origin: origin,
                Cookie: [...cookies]
                    .map(([key, value]) => `${key}=${value}`)
                    .join("; "),
                ...(body === undefined
                    ? {}
                    : {
                          "Content-Type": form
                              ? "application/x-www-form-urlencoded"
                              : "application/json",
                      }),
            },
            body:
                body === undefined
                    ? undefined
                    : form
                      ? body.toString()
                      : JSON.stringify(body),
        }),
    );
    for (const cookie of response.headers.getSetCookie()) {
        const item = cookie.split(";")[0];
        const separator = item.indexOf("=");
        cookies.set(item.slice(0, separator), item.slice(separator + 1));
    }
    return response;
}

beforeAll(async () => {
    runtime = await startRuntime({ persist: false });
    expect((await request("/__flow/reset", {})).status).toBe(200);
    expect((await request("/api/auth/sign-out", {})).status).toBe(200);
}, 60_000);

afterAll(async () => {
    cookies.clear();
    await runtime?.dispose();
});

async function beginSignIn(decision = "continue") {
    const response = await request("/api/auth/sign-in/social", {
        provider: "github",
        callbackURL: `${origin}/device`,
    });
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    expect(new URL(url).origin).toBe(origin);
    expect(new URL(url).pathname).toBe("/__flow/identity");
    const handoff = await request(url);
    expect(await handoff.text()).toContain("Local GitHub sign-in");
    const continued = await request(url, new URLSearchParams({ decision }));
    expect(continued.status).toBe(303);
    const callback = continued.headers.get("Location");
    if (!callback) throw new Error("Missing local callback");
    expect(new URL(callback).pathname).toBe("/api/auth/callback/github");
    return callback;
}

test.runIf(process.env.FLOW_LOCAL_SIGN_IN_TEST === "1")(
    "local provider failure is consumed once and the real callback succeeds on retry",
    async () => {
        await request("/__flow/outcome", { signIn: "fail-next" });
        const failed = await request(await beginSignIn());
        expect(
            new URL(failed.headers.get("Location") ?? "/", origin).pathname,
        ).toBe("/error");
        expect(
            await (await request("/api/auth/get-session")).json(),
        ).toBeNull();
        expect(await (await request("/__flow/outcome")).json()).toEqual({
            signIn: "normal",
        });

        const completed = await request(await beginSignIn());
        expect(
            new URL(completed.headers.get("Location") ?? "/", origin).pathname,
        ).toBe("/device");
        const session = await (await request("/api/auth/get-session")).json();
        expect(session.user.id).toBe(USER_ID);
        expect(session.user.githubUsername).toBe(localIdentity.login);
        expect(session.user.name).toBe(localIdentity.name);
        // A new Flow view must restore this real session, not a stale fixture token.
        await request("/__flow/conditions", {});
        expect(
            (await (await request("/api/auth/get-session")).json()).session.id,
        ).toBe(session.session.id);
        expect((await request("/api/auth/sign-out", {})).status).toBe(200);
        expect(
            await (await request("/api/auth/get-session")).json(),
        ).toBeNull();
    },
    30_000,
);

test.runIf(process.env.FLOW_LOCAL_SIGN_IN_TEST === "1")(
    "cancel and altered OAuth state cannot establish a local session",
    async () => {
        const canceled = await request(await beginSignIn("cancel"));
        expect(
            new URL(canceled.headers.get("Location") ?? "/", origin).pathname,
        ).toBe("/error");
        const callback = new URL(await beginSignIn());
        callback.searchParams.set("state", "not-the-state-from-enter");
        const rejected = await request(callback.href);
        expect(
            new URL(rejected.headers.get("Location") ?? "/", origin).pathname,
        ).toBe("/error");
        expect(
            await (await request("/api/auth/get-session")).json(),
        ).toBeNull();
    },
    30_000,
);
