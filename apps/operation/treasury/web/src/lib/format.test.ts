import { describe, expect, it } from "vitest";
import {
    baseName,
    fmtMoney,
    fmtUsd,
    fmtUsd2,
    hoursSince,
    sha8,
} from "./format";

describe("format", () => {
    it("fmtUsd rounds and handles null", () => {
        expect(fmtUsd(1234.56)).toBe("$1,235");
        expect(fmtUsd(0)).toBe("$0");
        expect(fmtUsd(null)).toBe("-");
        expect(fmtUsd(undefined)).toBe("-");
    });

    it("fmtUsd2 keeps cents", () => {
        expect(fmtUsd2(480.19)).toBe("$480.19");
        expect(fmtUsd2(null)).toBe("-");
    });

    it("fmtMoney uses the row currency", () => {
        expect(fmtMoney(90, "EUR")).toBe("€90.00");
        expect(fmtMoney(1000.04, "USD")).toBe("$1,000.04");
        expect(fmtMoney(12.5, "GBP")).toBe("12.50 GBP");
        expect(fmtMoney(null, "EUR")).toBe("-");
    });

    it("sha8 truncates", () => {
        expect(sha8("aa11bb22cc33dd44ee55")).toBe("aa11bb22");
    });

    it("baseName strips directories", () => {
        expect(baseName("2026-03/vast_2026-03_aa11bb22_inv.pdf")).toBe(
            "vast_2026-03_aa11bb22_inv.pdf",
        );
        expect(baseName("plain.pdf")).toBe("plain.pdf");
        expect(baseName("")).toBe("");
    });

    it("hoursSince parses TB DateTime as UTC", () => {
        const now = Date.parse("2026-07-03T12:00:00Z");
        expect(hoursSince("2026-07-03 06:00:00", now)).toBeCloseTo(6, 5);
        expect(hoursSince("garbage", now)).toBe(Number.POSITIVE_INFINITY);
    });
});
