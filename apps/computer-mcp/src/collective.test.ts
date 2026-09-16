import { describe, expect, it } from "vitest";
import { isCollectiveRepo } from "./collective.ts";

describe("isCollectiveRepo", () => {
    it("matches the collective repository only", () => {
        expect(
            isCollectiveRepo(
                "https://github.com/pollinations/collective-memory",
            ),
        ).toBe(true);
        expect(
            isCollectiveRepo(
                "https://github.com/pollinations/collective-memory.git",
            ),
        ).toBe(true);
        for (const url of [
            "https://github.com/pollinations/pollinations.git",
            "https://github.com/pollinations/collective-memory-fork.git",
            "https://github.com/pollinations/collective-memory/../pollinations",
            "https://evil.example/pollinations/collective-memory.git",
            "http://github.com/pollinations/collective-memory.git",
            undefined,
        ]) {
            expect(isCollectiveRepo(url)).toBe(false);
        }
    });
});
