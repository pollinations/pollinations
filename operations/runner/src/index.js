// The agent runner: GitHub posts each webhook here, a route picks the agent,
// and one Durable Object per issue does the work, so a request returns at
// once while the run keeps going for up to 15 minutes. WRITE=1 lets runs post.
import { DurableObject } from "cloudflare:workers";
import communityAppReview from "../../agents/community-app/REVIEW.md";
import { githubClient, verifySignature } from "./github.js";
import { matchRoute, ROUTES } from "./routes.js";
import { run } from "./run.js";

const RULEBOOKS = { "community-app/review": communityAppReview };

export class Job extends DurableObject {
    start(job) {
        // The newest event for this issue wins; an older run writes nothing.
        this.latest = job.delivery;
        this.ctx.waitUntil(this.execute(job));
    }

    async execute({ delivery, routeId, repo, issue }) {
        const route = ROUTES.find((r) => r.id === routeId);
        try {
            await run({
                route,
                rulebook: RULEBOOKS[routeId],
                issue,
                repo,
                github: await githubClient(this.env, repo),
                key: this.env[route.keyEnv],
                write: this.env.WRITE === "1",
                isLatest: () => this.latest === delivery,
            });
        } catch (error) {
            console.error(`${routeId} #${issue.number}: ${error.message}`);
        }
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
        );
        if (!route) return new Response("ignored", { status: 202 });
        const repo = payload.repository.full_name;
        await env.JOBS.getByName(`${repo}#${payload.issue.number}`).start({
            delivery: request.headers.get("x-github-delivery"),
            routeId: route.id,
            repo,
            issue: payload.issue,
        });
        return new Response("started", { status: 202 });
    },
};
