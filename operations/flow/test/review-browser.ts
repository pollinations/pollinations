import type { AddressInfo } from "node:net";
import type { Browser } from "playwright";
import githubProfile from "../github-profile.json";
import { ADMIN_ORIGIN } from "../local-origins";
import type { ReviewCase } from "../review-cases";
import { prepareReviewCase } from "../review-prepare";
import { serveReviewTransport } from "../review-transport";
import type { startRuntime } from "../runtime";

const reviewOrigin = "http://localhost:4180";

// These navigation checks share disposable Workers, never the running lab's data.
export async function openReviewContext(
    runtime: Awaited<ReturnType<typeof startRuntime>>,
    browser: Browser,
    recipe: ReviewCase,
) {
    const origin = reviewOrigin;
    const prepared = await prepareReviewCase(recipe, (path, body) =>
        runtime.fetch(
            new Request(`${origin}${path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }),
        ),
    );
    const readState = async () =>
        (await runtime.fetch(new Request(`${origin}/__flow/state`))).json();
    const before = await readState();
    const credentialRequests: string[] = [];
    const transport = await serveReviewTransport((request) => {
        const path = new URL(request.url).pathname;
        if (
            request.method === "POST" &&
            [
                "/api/api-keys",
                "/api/oauth/code",
                "/api/oauth/token",
                "/api/auth/oauth2/token",
            ].includes(path)
        )
            credentialRequests.push(path);
        return runtime.fetch(request);
    });
    const context = await browser.newContext({
        proxy: {
            server: `http://127.0.0.1:${(transport.address() as AddressInfo).port}`,
            bypass: `<-loopback>,${new URL(githubProfile.avatar_url).hostname}`,
        },
    });
    context.on("close", () => {
        transport.close();
        if ("closeAllConnections" in transport) transport.closeAllConnections();
    });
    try {
        const cookie = prepared.headers.get("set-cookie")?.split(";")[0];
        if (recipe.conditions.account === "signed-in" && cookie) {
            const separator = cookie.indexOf("=");
            await context.addCookies([
                {
                    name: cookie.slice(0, separator),
                    value: cookie.slice(separator + 1),
                    url: origin,
                    httpOnly: true,
                    sameSite: "Lax",
                },
            ]);
        }
        // Product requests go to disposable real Workers; Vite only
        // supplies source files. No response replaces Enter or Gen.
        await context.route("**/*", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== origin && url.origin !== ADMIN_ORIGIN) {
                if (url.href === githubProfile.avatar_url)
                    await route.continue();
                else await route.abort("blockedbyclient");
                return;
            }
            await route.continue();
        });
        return { context, before, readState, credentialRequests };
    } catch (error) {
        await context.close();
        throw error;
    }
}
