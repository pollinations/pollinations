import { Context, Hono } from "hono";
import { proxy } from "hono/proxy";
import { authenticate } from "@/middleware/authenticate";
import { polar } from "@/middleware/polar.ts";
import type { Env } from "../env.ts";
import { z } from "zod";
import { track, type TrackVariables } from "@/middleware/track.ts";
import type { AuthVariables } from "@/middleware/authenticate.ts";
import type { PolarVariables } from "@/middleware/polar.ts";
import { removeUnset } from "@/util.ts";
import type { Session } from "@/auth.ts";
import { describeRoute } from "hono-openapi";
import { alias } from "@/middleware/alias.ts";

const chatCompletionSchema = z.object({
    model: z.string(),
    messages: z.array(
        z.object({
            role: z.enum(["system", "user", "assistant", "tool"]),
            content: z.string().optional(),
            name: z.string().optional(),
            tool_calls: z.array(z.any()).optional(),
            tool_call_id: z.string().optional(),
        }),
    ),
    max_tokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    stream: z.boolean().optional(),
});

export const proxyRoutes = new Hono<Env>()
    .get(
        "/openai/models",
        describeRoute({ description: "Get available text models." }),
        async (c) => {
            const targetUrl = proxyUrl(c, "https://text.pollinations.ai");
            return await proxy(targetUrl, {
                ...c.req,
                headers: proxyHeaders(c),
            });
        },
    )
    .use(authenticate)
    .use(polar)
    .use(alias({ "/openai/chat/completions": "/openai" }))
    .post(
        "/openai",
        describeRoute({
            description: [
                "OpenAI compatible endpoint for text generation.",
                "Also available under `/openai/chat/completions`.",
            ].join(" "),
        }),
        track("generate.text"),
        async (c) => {
            await authorizeRequest(c.var);
            const targetUrl = proxyUrl(
                c,
                "https://text.pollinations.ai/openai",
            );
            const response = await proxy(targetUrl, {
                method: c.req.method,
                headers: {
                    ...proxyHeaders(c),
                    ...generationHeaders(c.env.ENTER_TOKEN, c.var.auth.user),
                },
                body: JSON.stringify(await c.req.json()),
            });
            return response;
        },
    )
    // TODO: fix usage tracking for /generate/text
    // .get(
    //     "/text/:prompt",
    //     describeRoute({
    //         description: "Generates text from text prompts.",
    //     }),
    //     track("generate.text"),
    //     async (c) => {
    //         await authorizeRequest(c.var);
    //         const targetUrl =
    //             "https://text.pollinations.ai/openai/chat/completions";
    //         const requestBody = {
    //             model: c.req.query("model") || "openai",
    //             messages: [{ role: "user", content: c.req.param("prompt") }],
    //         };
    //         const response = await fetch(targetUrl, {
    //             method: "POST",
    //             headers: {
    //                 ...proxyHeaders(c),
    //                 ...generationHeaders(c.env.ENTER_TOKEN, c.var.auth.user),
    //             },
    //             body: JSON.stringify(requestBody),
    //         });
    //         console.log(response);
    //         const parsedResponse = openaiResponseSchema.parse(
    //             await response.json(),
    //         );
    //         return c.text(
    //             parsedResponse.choices[0].message?.content || "",
    //             200,
    //         );
    //     },
    // )
    .get(
        "/image/:prompt",
        describeRoute({
            description: "Generates images from text prompts.",
        }),
        track("generate.image"),
        async (c) => {
            await authorizeRequest(c.var);
            const targetUrl = proxyUrl(
                c,
                "https://image.pollinations.ai/prompt",
            );
            targetUrl.pathname = joinPaths(
                targetUrl.pathname,
                c.req.param("prompt"),
            );
            const response = await proxy(targetUrl, {
                ...c.req,
                headers: {
                    ...proxyHeaders(c),
                    ...generationHeaders(c.env.ENTER_TOKEN, c.var.auth.user),
                },
            });
            return response;
        },
    );

async function authorizeRequest({
    auth,
    polar,
    track,
}: AuthVariables & PolarVariables & TrackVariables) {
    if (!track.isFreeUsage) {
        const { user } = auth.requireActiveSession(
            "You need to be signed-in to use this model.",
        );
        await polar.requirePositiveBalance(user.id);
    }
}

function generationHeaders(
    enterToken: string,
    user?: Session["user"],
): Record<string, string> {
    return removeUnset({
        "x-enter-token": enterToken,
        "x-github-id": `${user?.githubId}`,
    });
}

function proxyHeaders(c: Context): Record<string, string> {
    const clientIP = c.req.header("cf-connecting-ip") || "";
    const clientHost = c.req.header("host") || "";
    return {
        ...c.req.header(),
        "x-request-id": c.get("requestId"),
        "x-forwarded-host": clientHost,
        "x-forwarded-for": clientIP,
        "x-real-ip": clientIP,
    };
}

function proxyUrl(
    c: Context,
    targetBaseUrl: string,
    targetPort: string = "",
): URL {
    const incomingUrl = new URL(c.req.url);
    const targetUrl = new URL(targetBaseUrl);
    targetUrl.port = targetPort;
    targetUrl.search = incomingUrl.search;
    return targetUrl;
}

function joinPaths(...paths: string[]): string {
    return paths.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}
