import { describe, expect, it } from "vitest";
import {
    buildFxOverrideChange,
    buildGrantOverrideChange,
    canEditGrantSource,
} from "./CreditsTab";

describe("canEditGrantSource", () => {
    it("allows manual and hardcoded grant values only", () => {
        expect(canEditGrantSource("")).toBe(true);
        expect(canEditGrantSource("hc")).toBe(true);
        expect(canEditGrantSource("manual")).toBe(true);
        expect(canEditGrantSource("api")).toBe(false);
        expect(canEditGrantSource("cli")).toBe(false);
    });
});

describe("buildGrantOverrideChange", () => {
    it("builds an overrides row for editable grant amounts", () => {
        expect(
            buildGrantOverrideChange({
                enteredAt: "2026-07-03 12:00:00",
                field: "left_usd",
                note: "operator check",
                pool: "lambda",
                value: 1500,
            }),
        ).toEqual({
            datasource: "overrides",
            row: {
                entered_at: "2026-07-03 12:00:00",
                scope: "grants",
                key: "lambda",
                field: "left_usd",
                value_num: 1500,
                value_str: "",
                note: "operator check",
            },
            summary: "grants lambda left_usd -> 1500",
        });
    });
});

describe("buildFxOverrideChange", () => {
    it("builds the fx config override row", () => {
        expect(
            buildFxOverrideChange({
                enteredAt: "2026-07-03 12:00:00",
                value: 1.12,
            }),
        ).toEqual({
            datasource: "overrides",
            row: {
                entered_at: "2026-07-03 12:00:00",
                scope: "config",
                key: "fx_eur_usd",
                field: "value",
                value_num: 1.12,
                value_str: "",
                note: "",
            },
            summary: "config fx_eur_usd -> 1.12",
        });
    });
});
