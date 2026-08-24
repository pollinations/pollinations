import { describe, expect, it } from "vitest";
import { earningsCommand } from "./earnings.js";

describe("earningsCommand", () => {
    it("is configured with correct command name and description", () => {
        expect(earningsCommand.name()).toBe("earnings");
        expect(earningsCommand.description()).toContain("earnings");
    });

    it("defines --days option with default value 30", () => {
        const option = earningsCommand.options.find(
            (opt) => opt.long === "--days",
        );
        expect(option).toBeDefined();
        expect(option?.defaultValue).toBe("30");
    });
});
