import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    setOutputMode,
    getOutputMode,
    setQuietMode,
    isQuietMode,
    setVerboseMode,
    isVerboseMode,
    printResult,
    printTable,
    printInfo,
    printMeta,
    printSuccess,
    printError,
    printWarn,
    printDebug,
} from "../../lib/output.js";

describe("output", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        setOutputMode("human");
        setQuietMode(false);
        setVerboseMode(false);
    });

    it("should set and get output mode", () => {
        setOutputMode("json");
        expect(getOutputMode()).toBe("json");
        setOutputMode("human");
        expect(getOutputMode()).toBe("human");
        setOutputMode("yaml");
        expect(getOutputMode()).toBe("yaml");
        setOutputMode("csv");
        expect(getOutputMode()).toBe("csv");
    });

    it("should set and get quiet mode", () => {
        setQuietMode(true);
        expect(isQuietMode()).toBe(true);
        setQuietMode(false);
        expect(isQuietMode()).toBe(false);
    });

    it("should set and get verbose mode", () => {
        setVerboseMode(true);
        expect(isVerboseMode()).toBe(true);
        setVerboseMode(false);
        expect(isVerboseMode()).toBe(false);
    });

    it("should print result in human mode", () => {
        setOutputMode("human");
        printResult({ key: "value" });
        expect(process.stdout.write).toHaveBeenCalled();
    });

    it("should print result in json mode", () => {
        setOutputMode("json");
        printResult({ key: "value" });
        expect(process.stdout.write).toHaveBeenCalledWith(
            expect.stringContaining('"key"')
        );
    });

    it("should print table in human mode", () => {
        setOutputMode("human");
        printTable([{ name: "test", value: 123 }]);
        expect(process.stdout.write).toHaveBeenCalled();
    });

    it("should print table in json mode", () => {
        setOutputMode("json");
        printTable([{ name: "test", value: 123 }]);
        expect(process.stdout.write).toHaveBeenCalledWith(
            expect.stringContaining('"name"')
        );
    });

    it("should respect quiet mode for info", () => {
        setQuietMode(true);
        printInfo("test info");
        expect(process.stderr.write).not.toHaveBeenCalled();
    });

    it("should print error even in quiet mode", () => {
        setQuietMode(true);
        printError("test error");
        expect(process.stderr.write).toHaveBeenCalled();
    });

    it("should print debug only in verbose mode", () => {
        setVerboseMode(false);
        printDebug("debug message");
        expect(process.stderr.write).not.toHaveBeenCalled();
        setVerboseMode(true);
        printDebug("debug message");
        expect(process.stderr.write).toHaveBeenCalled();
    });
});