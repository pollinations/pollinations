import { describe, expect, it } from "vitest";
import { createReviewServices } from "../review-services";
import { parseReviewSetup } from "../review-setup";

describe("local external-service review conditions", () => {
    it("only accepts named conditions, with no arbitrary database or response payload", () => {
        expect(
            parseReviewSetup({ billing: "ready", rewards: "claimed" }),
        ).toEqual({ billing: "ready", rewards: "claimed" });
        for (const input of [
            { sql: "DELETE" },
            { billing: "production" },
            { body: { user: {} } },
            [],
            null,
        ])
            expect(() => parseReviewSetup(input)).toThrow();
    });
    it("only serves configured local provider fixtures and never forwards", async () => {
        const service = createReviewServices();
        const customer = new Request(
            "https://api.stripe.com/v1/customers/cus_connect_review",
        );
        expect(await service.outbound(customer)).toBeUndefined();
        service.configure({ billing: "ready" });
        expect((await (await service.outbound(customer))?.json())?.id).toBe(
            "cus_connect_review",
        );
        expect(
            await service.outbound(
                new Request(
                    "https://api.stripe.com/v1/customers/real_customer",
                ),
            ),
        ).toBeUndefined();
        expect(
            await service.outbound(new Request(customer, { method: "POST" })),
        ).toBeUndefined();
        service.configure({});
        expect(await service.outbound(customer)).toBeUndefined();
    });
    it("supplies both protocols required by the real endpoint probe", async () => {
        const service = createReviewServices();
        service.configure({ endpoint: "success" });
        const response = (stream: boolean) =>
            service.outbound(
                new Request(
                    "https://connect-review.invalid/v1/chat/completions",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ stream }),
                    },
                ),
            );
        expect(
            (await (await response(false))?.json())?.usage.total_tokens,
        ).toBe(3);
        const streamed = await response(true);
        expect(streamed?.headers.get("content-type")).toBe("text/event-stream");
        expect(await streamed?.text()).toContain("data: [DONE]");
    });
    it("serves only the configured quest catalog read, never a GitHub mutation", async () => {
        const service = createReviewServices();
        const request = (query = "query($query:String!){ search { nodes } }") =>
            new Request("https://api.github.com/graphql", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query,
                    variables: {
                        query: "repo:pollinations/pollinations label:POLLEN-QUEST is:issue",
                    },
                }),
            });
        expect(await service.outbound(request())).toBeUndefined();
        service.configure({ rewards: "available" });
        expect(await (await service.outbound(request()))?.json()).toEqual({
            data: { search: { nodes: [] } },
        });
        expect(
            await service.outbound(request("mutation { addComment { id } }")),
        ).toBeUndefined();
        service.configure({});
        expect(await service.outbound(request())).toBeUndefined();
    });
});
