import { describe, expect, it } from "vitest";

describe("earningsCommand", () => {
    it("is defined", async () => {
        const { earningsCommand } = await import("./earnings.js");
        expect(earningsCommand).toBeDefined();
        expect(earningsCommand.name()).toBe("earnings");
    });
});
