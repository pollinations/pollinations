import { describe, expect, it } from "vitest";
import { parseEnv } from "./machine.js";

describe("parseEnv", () => {
    it("splits on the first equals sign", () => {
        expect(parseEnv(["A=1", "URL=https://x.test/?a=b", "EMPTY="])).toEqual({
            A: "1",
            URL: "https://x.test/?a=b",
            EMPTY: "",
        });
    });

    it("rejects pairs without a key", () => {
        expect(() => parseEnv(["novalue"])).toThrow("KEY=value");
        expect(() => parseEnv(["=x"])).toThrow("KEY=value");
    });
});
