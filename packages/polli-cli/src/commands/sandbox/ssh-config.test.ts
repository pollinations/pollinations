import { describe, expect, it } from "vitest";
import { hasSshInclude } from "./ssh.js";

const INCLUDE = "Include ~/.pollinations/ssh/config";

describe("hasSshInclude", () => {
    it("finds the Include line in an LF config", () => {
        expect(hasSshInclude(`${INCLUDE}\nHost example\n`)).toBe(true);
    });

    it("finds the Include line in a CRLF config", () => {
        expect(hasSshInclude(`${INCLUDE}\r\nHost example\r\n`)).toBe(true);
    });

    it("does not mistake a different include for ours", () => {
        expect(hasSshInclude("Include ~/.ssh/other\n")).toBe(false);
        expect(hasSshInclude("")).toBe(false);
    });
});
