import { describe, expect, it } from "vitest";
import {
    initialStagingState,
    rowsByDatasource,
    type StagedChange,
    stagingReducer,
} from "./staging";

const change = (id: string, datasource: string): StagedChange => ({
    id,
    datasource,
    row: { id },
    summary: `${datasource} ${id}`,
});

describe("stagingReducer", () => {
    it("stages and discards changes", () => {
        const staged = stagingReducer(initialStagingState, {
            type: "stage",
            change: change("a", "overrides"),
        });
        expect(staged.changes).toHaveLength(1);

        const discarded = stagingReducer(staged, {
            type: "discard",
            id: "a",
        });
        expect(discarded.changes).toHaveLength(0);
    });

    it("clears changes after commit success", () => {
        const staged = stagingReducer(initialStagingState, {
            type: "stage",
            change: change("a", "invoices"),
        });
        const committed = stagingReducer(staged, { type: "commitSuccess" });
        expect(committed).toEqual(initialStagingState);
    });
});

describe("rowsByDatasource", () => {
    it("groups staged row bodies by datasource", () => {
        const grouped = rowsByDatasource([
            change("a", "overrides"),
            change("b", "invoices"),
            change("c", "overrides"),
        ]);

        expect(grouped.get("overrides")).toEqual([{ id: "a" }, { id: "c" }]);
        expect(grouped.get("invoices")).toEqual([{ id: "b" }]);
    });
});
