// The agent runner: GitHub posts each webhook here, a route picks the agent,
// and one Durable Object per issue keeps the job and runs it from an alarm, so
// a request returns at once and a restart loses nothing. WRITE=1 lets runs post.
import { DurableObject } from "cloudflare:workers";
import communityAppsReview from "../../agents/community-apps/REVIEW.md";
import { githubClient, verifySignature } from "./github.js";
import { receive, work } from "./jobs.js";
import { matchRoute, ROUTES } from "./routes.js";
import { deliver, review } from "./run.js";

const RULEBOOKS = { "community-apps/review": communityAppsReview };

export class Job extends DurableObject {
    start(job) {
        return receive(this.ctx.storage, job);
    }

    alarm() {
        let github;
        // Everything a review or a delivery needs, with one GitHub token per alarm.
        const setup = async ({ routeId, repo, number }) => {
            const route = ROUTES.find((r) => r.id === routeId);
            github ??= await githubClient(this.env, repo, route.permissions);
            return {
                route,
                repo,
                number,
                github,
                rulebook: RULEBOOKS[routeId],
                key: this.env[route.keyEnv],
            };
        };
        return work(this.ctx.storage, {
            review: async (job, { lastAttempt }) =>
                review({ ...(await setup(job)), lastAttempt }),
            // Silent mode stops here: the review is already in the logs.
            deliver: async (job, result, { isLatest }) =>
                this.env.WRITE === "1" &&
                deliver({ ...(await setup(job)), result, isLatest }),
        });
    }
}

export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);
        if (request.method === "GET" && pathname === "/health")
            return Response.json({ ok: true });
        if (request.method !== "POST" || pathname !== "/github")
            return new Response("not found", { status: 404 });
        const body = await request.text();
        if (
            !(await verifySignature(
                env.GITHUB_WEBHOOK_SECRET,
                body,
                request.headers.get("x-hub-signature-256"),
            ))
        )
            return new Response("bad signature", { status: 401 });
        const payload = JSON.parse(body);
        const route = matchRoute(
            request.headers.get("x-github-event"),
            payload,
            env.REPO,
        );
        if (!route) return new Response("ignored", { status: 202 });
        const repo = env.REPO;
        await env.JOBS.getByName(`${repo}#${payload.issue.number}`).start({
            delivery: request.headers.get("x-github-delivery"),
            routeId: route.id,
            repo,
            number: payload.issue.number,
        });
        return new Response("started", { status: 202 });
    },
};
