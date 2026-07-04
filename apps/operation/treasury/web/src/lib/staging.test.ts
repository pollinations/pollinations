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
            change: change("a", "invoices", "invoices:sha1", { v: 1 }),
        });
        const second = stagingReducer(first, {
            type: "stage",
            change: change("b", "invoices", "invoices:sha1", { v: 2 }),
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
            { type: "stage", change: change("b", "invoices") },
        );
        const cleared = stagingReducer(staged, { type: "clear" });
        expect(cleared.changes).toHaveLength(0);
        expect(cleared.resetNonce).toBe(staged.resetNonce + 1);
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
