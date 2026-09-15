import { localIdentity } from "./fixtures";
import type { ReviewSetup } from "./review-setup";

// Local external-service fixtures. Enter still authenticates, reads its database,
// interprets these provider responses, and renders its own UI. Never forwards.
export function createReviewServices() {
    let setup: ReviewSetup = {};
    return {
        configure(value: ReviewSetup) {
            setup = value;
        },
        async outbound(request: Request): Promise<Response | undefined> {
            const url = new URL(request.url);
            if (
                url.origin === "https://api.github.com" &&
                url.pathname === "/graphql" &&
                request.method === "POST"
            ) {
                const body = (await request.json()) as {
                    query?: string;
                    variables?: { query?: string };
                };
                if (
                    body.query?.trimStart().startsWith("query(") &&
                    [
                        "repo:pollinations/pollinations label:POLLEN-QUEST is:issue",
                        `repo:pollinations/pollinations is:pr is:merged author:${localIdentity.login}`,
                    ].includes(body.variables?.query ?? "")
                )
                    return Response.json({ data: { search: { nodes: [] } } });
                return;
            }
            if (
                url.origin === "https://connect-review.invalid" &&
                request.method === "POST" &&
                setup.endpoint === "success"
            ) {
                const body = (await request.json()) as { stream?: boolean };
                const usage = {
                    prompt_tokens: 2,
                    completion_tokens: 1,
                    total_tokens: 3,
                };
                const response = {
                    id: "connect-review",
                    object: body.stream
                        ? "chat.completion.chunk"
                        : "chat.completion",
                    created: 0,
                    model: "example-model",
                    choices: [
                        {
                            index: 0,
                            ...(body.stream
                                ? { delta: { content: "OK" } }
                                : {
                                      message: {
                                          role: "assistant",
                                          content: "OK",
                                      },
                                  }),
                            finish_reason: "stop",
                        },
                    ],
                    usage,
                };
                return body.stream
                    ? new Response(
                          `data: ${JSON.stringify(response)}\n\ndata: [DONE]\n\n`,
                          { headers: { "Content-Type": "text/event-stream" } },
                      )
                    : Response.json(response);
            }
            if (request.method !== "GET") return;
            // Baseline external data is available during ordinary navigation,
            // independently of the selected reward or wallet situation. Enter
            // derives the catalog, rewards and balances from these responses.
            if (
                url.origin === "https://api.github.com" &&
                url.pathname === `/users/${localIdentity.login}/repos`
            )
                return Response.json([]);
            if (
                url.origin === "http://localhost:7181" &&
                [
                    "/v0/pipes/developer_earnings_today.json",
                    "/v0/pipes/quest_model_modalities.json",
                    "/v0/pipes/quest_app_usage.json",
                    "/v0/pipes/app_directory_public.json",
                ].includes(url.pathname)
            )
                return Response.json({ data: [], rows: 0 });
            if (
                url.origin === "https://discord.com" &&
                ["/api/users/@me", "/api/users/%40me"].includes(url.pathname) &&
                setup.discord === "connected"
            )
                return Response.json({
                    id: "100000000000000001",
                    username: "connect-review",
                    global_name: "Connect review",
                    email: "review@example.invalid",
                    verified: true,
                    avatar: null,
                    discriminator: "0",
                });

            if (
                url.origin === "http://localhost:7181" &&
                url.pathname.startsWith("/v0/pipes/") &&
                setup.activity
            )
                return Response.json({
                    data:
                        setup.activity === "available" &&
                        url.pathname.includes("activity_usage_chart")
                            ? [
                                  {
                                      date: new Date()
                                          .toISOString()
                                          .slice(0, 10),
                                      api_key_id: "connect-review-key",
                                      api_key: "App example",
                                      model: "openai",
                                      meter_source: "pack",
                                      requests: 3,
                                      cost_usd: 0.02,
                                  },
                              ]
                            : [],
                    rows: 0,
                });

            // These records belong to the local provider, just as the customer
            // reference belongs to D1. Restarting the host must not erase them.
            // Enter's stored billing preferences determine which ones it reads.
            if (url.origin === "https://api.stripe.com") {
                if (url.pathname === "/v1/customers/cus_connect_review")
                    return Response.json({
                        id: "cus_connect_review",
                        object: "customer",
                        name: "Connect review",
                        email: "review@example.invalid",
                        address: { country: "DE" },
                        invoice_settings: {
                            default_payment_method: "pm_connect_review",
                        },
                    });
                if (url.pathname === "/v1/payment_methods/pm_connect_review")
                    return Response.json({
                        id: "pm_connect_review",
                        object: "payment_method",
                        type: "card",
                        card: { brand: "visa", last4: "4242" },
                        billing_details: {
                            name: "Connect review",
                            address: { country: "DE" },
                        },
                    });
                if (url.pathname === "/v1/invoices/in_connect_review")
                    return Response.json({
                        id: "in_connect_review",
                        object: "invoice",
                        status: "open",
                        hosted_invoice_url:
                            "https://billing.example.invalid/connect-review",
                    });
            }
            return undefined;
        },
        async integrations(request: Request): Promise<Response> {
            const url = new URL(request.url);
            if (request.method === "GET") {
                if (url.pathname === "/connections")
                    return Response.json({
                        data:
                            setup.connections === "connected"
                                ? [
                                      {
                                          id: "connect-review-integration",
                                          toolkit: "github",
                                          name: "GitHub",
                                          logo: null,
                                          alias: "Connect review",
                                          status: "ACTIVE",
                                      },
                                  ]
                                : [],
                    });
                if (url.pathname === "/toolkits")
                    return Response.json({
                        data: [
                            {
                                slug: "github",
                                name: "GitHub",
                                description: "Code and repositories.",
                                logo: null,
                            },
                        ],
                    });
            }
            return Response.json(
                {
                    message:
                        "External services are unavailable in this local harness",
                },
                { status: 503 },
            );
        },
    };
}
