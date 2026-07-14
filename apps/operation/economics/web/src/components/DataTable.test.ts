import { describe, expect, it } from "vitest";
import { sortRows } from "./DataTable";

type Row = {
    id: string;
    amount?: number | null;
    name?: string;
};

describe("sortRows", () => {
    it("sorts numbers in both directions", () => {
        const rows: Row[] = [
            { id: "b", amount: 20 },
            { id: "a", amount: 10 },
            { id: "c", amount: 30 },
        ];
        const column = { key: "amount", value: (row: Row) => row.amount };

        expect(sortRows(rows, column, "asc").map((row) => row.id)).toEqual([
            "a",
            "b",
            "c",
        ]);
        expect(sortRows(rows, column, "desc").map((row) => row.id)).toEqual([
            "c",
            "b",
            "a",
        ]);
    });

    it("keeps empty numeric values last in both directions", () => {
        const rows: Row[] = [
            { id: "twenty", amount: 20 },
            { id: "blank", amount: null },
            { id: "zero", amount: 0 },
            { id: "thirty", amount: 30 },
        ];
        const column = { key: "amount", value: (row: Row) => row.amount };

        expect(sortRows(rows, column, "asc").map((row) => row.id)).toEqual([
            "zero",
            "twenty",
            "thirty",
            "blank",
        ]);
        expect(sortRows(rows, column, "desc").map((row) => row.id)).toEqual([
            "thirty",
            "twenty",
            "zero",
            "blank",
        ]);
    });

    it("sorts text naturally and keeps empty values last", () => {
        const rows: Row[] = [
            { id: "ten", name: "vendor 10" },
            { id: "blank", name: "" },
            { id: "two", name: "vendor 2" },
            { id: "alpha", name: "Alpha" },
        ];
        const column = { key: "name", value: (row: Row) => row.name };

        expect(sortRows(rows, column, "asc").map((row) => row.id)).toEqual([
            "alpha",
            "two",
            "ten",
            "blank",
        ]);
        expect(sortRows(rows, column, "desc").map((row) => row.id)).toEqual([
            "ten",
            "two",
            "alpha",
            "blank",
        ]);
    });

    it("keeps original order for ties", () => {
        const rows: Row[] = [
            { id: "first", amount: 10 },
            { id: "second", amount: 10 },
        ];
        const column = { key: "amount", value: (row: Row) => row.amount };

        expect(sortRows(rows, column, "asc").map((row) => row.id)).toEqual([
            "first",
            "second",
        ]);
    });
});
