import { expect, test } from "vitest";
import { feedImageURL } from "../src/feedImageUrl.ts";

test("the feed's image URL drops credential parameters and keeps the rest as sent", () => {
    expect(
        feedImageURL("/prompt/a%20cat?width=512&key=sk_abc&height=512"),
    ).toBe("https://image.pollinations.ai/prompt/a%20cat?width=512&height=512");
    expect(feedImageURL("/prompt/x?token=pk_1&API_KEY=z&Authorization=y")).toBe(
        "https://image.pollinations.ai/prompt/x",
    );
    // A key under any other name is dropped too
    expect(feedImageURL("/prompt/x?seed=1&ref=sk_leak&nologo=true")).toBe(
        "https://image.pollinations.ai/prompt/x?seed=1&nologo=true",
    );
    expect(feedImageURL("/prompt/x?seed=1&k%65y=sk_encoded")).toBe(
        "https://image.pollinations.ai/prompt/x?seed=1",
    );
    expect(feedImageURL("/prompt/no%20query")).toBe(
        "https://image.pollinations.ai/prompt/no%20query",
    );
});
