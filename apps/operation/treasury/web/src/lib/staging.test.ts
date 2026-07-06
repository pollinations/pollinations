import { describe, expect, it } from "vitest";
import {
    initialStagingState,
    rowsByDatasource,
    type StagedChange,
    stagingReducer,
} from "./staging";

const change = (
    id: string,
    datasource: string,
    key = id,
    row: Record<string, unknown> = { id },
): StagedChange => ({
    id,
    key,
    datasource,
    row,
    summary: `${datasource} ${id}`,
});

describe("stagingReducer", () => {
    it("stages and unstages by key", () => {
        const staged = stagingReducer(initialStagingState, {
            type: "stage",
            change: change("a", "overrides", "grants:pool:left_usd"),
        });
        expect(staged.changes).toHaveLength(1);

        const unstaged = stagingReducer(staged, {
            type: "unstage",
            key: "grants:pool:left_usd",
        });
        expect(unstaged.changes).toHaveLength(0);
    });

    it("re-staging the same key replaces instead of duplicating", () => {
        const first = stagingReducer(initialStagingState, {
            type: "stage",
            change: change("a", "overrides", "transactions:row:provider", {
                v: 1,
            }),
        });
        const second = stagingReducer(first, {
            type: "stage",
            change: change("b", "overrides", "transactions:row:provider", {
                v: 2,
            }),
        });
        expect(second.changes).toHaveLength(1);
        expect(second.changes[0].row).toEqual({ v: 2 });
    });

    it("clear drops every pending change", () => {
        const staged = stagingReducer(
            stagingReducer(initialStagingState, {
                type: "stage",
                change: change("a", "overrides"),
            }),
            { type: "stage", change: change("b", "meter_monthly") },
        );
        const cleared = stagingReducer(staged, { type: "clear" });
        expect(cleared.changes).toHaveLength(0);
        expect(cleared.resetNonce).toBe(staged.resetNonce + 1);
    });

    it("clears changes after commit success", () => {
        const staged = stagingReducer(initialStagingState, {
            type: "stage",
            change: change("a", "overrides"),
        });
        const committed = stagingReducer(staged, {
            type: "commitSuccess",
            changes: staged.changes,
        });
        expect(committed.changes).toEqual([]);
        expect(committed.committed).toEqual(staged.changes);
        expect(committed.committing).toBe(false);
    });
});

describe("rowsByDatasource", () => {
    it("groups staged row bodies by datasource", () => {
        const grouped = rowsByDatasource([
            change("a", "overrides"),
            change("b", "meter_monthly"),
            change("c", "overrides"),
        ]);

        expect(grouped.get("overrides")).toEqual([{ id: "a" }, { id: "c" }]);
        expect(grouped.get("meter_monthly")).toEqual([{ id: "b" }]);
    });
});
