import { expect, test } from "vitest";
import { getModelPrices } from "../src/client/components/pricing/data.ts";

test("pricing data uses explicit public price when a model defines one", () => {
    const geminiFast = getModelPrices().find(
        (price) => price.name === "gemini-fast",
    );

    expect(geminiFast).toMatchObject({
        name: "gemini-fast",
        type: "text",
        promptTextPrice: "0.3",
        promptCachedPrice: "0.03",
        promptAudioPrice: "0.3",
        completionTextPrice: "1.2",
    });
});

test("pricing data still exposes standard models through the default price fallback", () => {
    const openai = getModelPrices().find((price) => price.name === "openai");

    expect(openai).toMatchObject({
        name: "openai",
        type: "text",
        promptTextPrice: "0.2",
        promptCachedPrice: "0.02",
        completionTextPrice: "1.25",
    });
});
