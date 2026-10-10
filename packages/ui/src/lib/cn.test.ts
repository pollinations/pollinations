import { describe, expect, test } from "vitest";
import { cn } from "./cn.ts";
import { cn as cnApp } from "./cn-app.ts";

describe("cn", () => {
    test("keeps the micro text size next to a text colour", () => {
        expect(cn("polli:text-micro polli:text-theme-text-muted")).toBe(
            "polli:text-micro polli:text-theme-text-muted",
        );
        expect(cnApp("text-micro text-theme-text-muted")).toBe(
            "text-micro text-theme-text-muted",
        );
    });

    test("still lets a later size replace micro", () => {
        expect(cn("polli:text-micro", "polli:text-sm")).toBe("polli:text-sm");
    });
});
