// The agent runner: GitHub posts each webhook here, a route picks the agent,
// and one Durable Object per issue keeps the job and runs it from an alarm, so
// a request returns at once and a restart loses nothing. WRITE=1 lets runs post.
import { DurableObject } from "cloudflare:workers";
import communityAppsReview from "../../agents/community-apps/REVIEW.md";
import { githubClient, verifySignature } from "./github.js";
import { receive, work } from "./jobs.js";
import { matchRoute, ROUTES } from "./routes.js";
import { run } from "./run.js";

const RULEBOOKS = { "community-apps/review": communityAppsReview };

export class Job extends DurableObject {
    start(job) {
        return receive(this.ctx.storage, job);
    }

    alarm() {
        return work(
            this.ctx.storage,
            async ({ routeId, repo, issue }, options) => {
                const route = ROUTES.find((r) => r.id === routeId);
                return run({
                    route,
                    rulebook: RULEBOOKS[routeId],
                    issue,
                    repo,
                    github: await githubClient(this.env, repo),
                    key: this.env[route.keyEnv],
                    write: this.env.WRITE === "1",
                    ...options,
                });
            },
        );
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
            issue: payload.issue,
        });
        return new Response("started", { status: 202 });
    },
};
