import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("community polls", () => {
    it("counts every answer reaction and requests polls ranked by total reactions", async () => {
        const { loadVotingIssues } = await import("./community");
        const fetchMock = vi.fn(async (_url: string) =>
            Response.json({
                items: [
                    {
                        number: 1,
                        title: "[Voting Issue] Which models should we add?",
                        html_url:
                            "https://github.com/pollinations/pollinations/issues/1",
                        reactions: {
                            "+1": 2,
                            heart: 3,
                            rocket: 4,
                            total_count: 9,
                        },
                    },
                ],
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(loadVotingIssues(3)).resolves.toEqual([
            {
                number: 1,
                title: "Which models should we add?",
                url: "https://github.com/pollinations/pollinations/issues/1",
                reactions: 9,
            },
        ]);
        const request = new URL(fetchMock.mock.calls[0][0]);
        expect(request.searchParams.get("sort")).toBe("reactions");
        expect(request.searchParams.get("order")).toBe("desc");
        expect(request.searchParams.get("per_page")).toBe("3");
    });
});
