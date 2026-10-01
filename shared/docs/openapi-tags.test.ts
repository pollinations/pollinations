import { describe, expect, it } from "vitest";
import { OPENAPI_TAGS } from "./openapi-tags.ts";

describe("OPENAPI_TAGS", () => {
    it("keeps stable exact strings for schema merge", () => {
        expect(OPENAPI_TAGS.account).toBe("👤 Account");
        expect(OPENAPI_TAGS.quests).toBe("✨ Quests");
        expect(OPENAPI_TAGS.communityModels).toBe("🧩 Community Models");
        expect(OPENAPI_TAGS.communityAgents).toBe("🤖 Community Agents");
        expect(OPENAPI_TAGS.connectedApps).toBe("🔗 Account");
    });
});
