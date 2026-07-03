import { describe, expect, it } from "vitest";
import { statusMeta } from "./recon";

describe("recon status metadata", () => {
    it("colors every current gaps.py status and falls back safely", () => {
        expect(statusMeta("ok").severity).toBe(0);
        expect(statusMeta("ok_credit").intent).toBe("news");
        expect(statusMeta("accepted").severity).toBe(0);
        expect(statusMeta("needs_data").label).toBe("no data");
        expect(statusMeta("needs_label").intent).toBe("alpha");
        expect(statusMeta("amount_mismatch").intent).toBe("warning");
        expect(statusMeta("missing_payment").intent).toBe("danger");
        expect(statusMeta("missing_invoice").intent).toBe("danger");
        expect(statusMeta("something_new").label).toBe("something_new");
    });
});
