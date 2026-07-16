import assert from "node:assert/strict";
import test from "node:test";

import {
    chunk,
    enterWorkdir,
    legacyGithubNodeId,
    selectUsernameChanges,
} from "./sync-github-usernames.mjs";

test("encodes a numeric GitHub account ID as its legacy global node ID", () => {
    assert.equal(legacyGithubNodeId(133474899), "MDQ6VXNlcjEzMzQ3NDg5OQ==");
});

test("selects only changed usernames from resolved GitHub users", () => {
    assert.deepEqual(
        selectUsernameChanges(
            [
                { githubId: 1, githubUsername: "unchanged" },
                { githubId: 2, githubUsername: "old-name" },
                { githubId: 3, githubUsername: "deleted-user" },
            ],
            [
                { githubId: 1, login: "unchanged" },
                { githubId: 2, login: "new-name" },
            ],
        ),
        [{ githubId: 2, githubUsername: "new-name" }],
    );
});

test("keeps GraphQL requests within the requested batch size", () => {
    const batches = chunk(
        Array.from({ length: 101 }, (_, index) => index),
        100,
    );
    assert.deepEqual(
        batches.map((batch) => batch.length),
        [100, 1],
    );
});

test("runs Wrangler from the Enter service directory", () => {
    assert.match(enterWorkdir, /enter\.pollinations\.ai\/$/);
});
