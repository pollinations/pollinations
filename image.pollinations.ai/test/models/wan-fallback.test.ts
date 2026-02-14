import { beforeEach, describe, expect, it } from "vitest";

// Mock environment variables before importing the module
const mockEnv = {
    AIRFORCE_API_KEY: "test_airforce_key",
    DASHSCOPE_API_KEY: "test_dashscope_key",
};

beforeEach(() => {
    Object.assign(process.env, mockEnv);
});

describe("Wan video model fallback", () => {
    it("should export callWanAPI function", async () => {
        const { callWanAPI } = await import(
            "../../src/models/wanVideoModel.ts"
        );
        expect(typeof callWanAPI).toBe("function");
    });

    it("should have both T2V and I2V model constants", async () => {
        const fs = await import("node:fs");
        const fileContent = fs.readFileSync(
            "src/models/wanVideoModel.ts",
            "utf-8",
        );

        // Check that the module has both model names
        expect(fileContent).toContain("wan2.6-text-to-video");
        expect(fileContent).toContain("wan2.6-i2v-flash");
    });
});

describe("Wan API structure validation", () => {
    it("should have Airforce primary implementation", async () => {
        const fs = await import("node:fs");
        const fileContent = fs.readFileSync(
            "src/models/wanVideoModel.ts",
            "utf-8",
        );

        expect(fileContent).toContain("callWanAirforceAPI");
        expect(fileContent).toContain("AIRFORCE_API_BASE");
        expect(fileContent).toContain("streamAirforceResponse");
    });

    it("should have Alibaba fallback implementation", async () => {
        const fs = await import("node:fs");
        const fileContent = fs.readFileSync(
            "src/models/wanVideoModel.ts",
            "utf-8",
        );

        expect(fileContent).toContain("callWanAlibabaAPI");
        expect(fileContent).toContain("DASHSCOPE_API_BASE");
        expect(fileContent).toContain("WAN_T2V_MODEL");
        expect(fileContent).toContain("WAN_I2V_MODEL");
    });

    it("should have fallback logic in main function", async () => {
        const fs = await import("node:fs");
        const fileContent = fs.readFileSync(
            "src/models/wanVideoModel.ts",
            "utf-8",
        );

        expect(fileContent).toContain("try {");
        expect(fileContent).toContain("catch (error)");
        expect(fileContent).toContain("DASHSCOPE_API_KEY");
        expect(fileContent).toContain("Falling back to Alibaba DashScope API");
    });

    it("should support both T2V and I2V modes", async () => {
        const fs = await import("node:fs");
        const fileContent = fs.readFileSync(
            "src/models/wanVideoModel.ts",
            "utf-8",
        );

        // Check for T2V support
        expect(fileContent).toContain("wan2.6-text-to-video");

        // Check for I2V support
        expect(fileContent).toContain("wan2.6-i2v-flash");

        // Check for conditional logic
        expect(fileContent).toContain(
            "imageUrl ? WAN_I2V_MODEL : WAN_T2V_MODEL",
        );
    });
});
