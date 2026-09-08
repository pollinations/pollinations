import assert from "node:assert/strict";
import test from "node:test";

import { authorizePolli } from "./polli-authorization.mjs";

const writeIds = [5099901, 36901823, 158852059, 74301576];
const prOnlyIds = [34513273, 204561696, 182555207, 189873015, 228371309];

function invoke({
    id = writeIds[0],
    login = "maintainer",
    eventName = "issue_comment",
    event,
    mode = "write",
    actor = login,
    triggeringActor = actor,
}) {
    return authorizePolli({
        eventName,
        event: event ?? {
            sender: { id, login },
            issue: { number: 1 },
            comment: { body: "!polli" },
        },
        actor,
        triggeringActor,
        mode,
    });
}

test("write authorizes all four IDs on each supported event", () => {
    const events = [
        [
            "issue_comment",
            { issue: { number: 1 }, comment: { body: "!polli" } },
        ],
        [
            "pull_request_review_comment",
            { pull_request: { number: 1 }, comment: { body: "!polli" } },
        ],
        [
            "pull_request_review",
            { pull_request: { number: 1 }, review: { body: "!polli" } },
        ],
        [
            "issues",
            {
                action: "opened",
                issue: { number: 1, title: "!polli", body: null },
            },
        ],
    ];
    for (const id of writeIds) {
        for (const [eventName, event] of events) {
            assert.equal(
                invoke({
                    id,
                    eventName,
                    event: { ...event, sender: { id, login: "maintainer" } },
                }),
                true,
            );
        }
    }
});

test("read authorizes four IDs on issues and PRs", () => {
    for (const id of writeIds) {
        assert.equal(
            invoke({
                id,
                mode: "read",
                event: {
                    sender: { id, login: "maintainer" },
                    issue: { number: 1 },
                    comment: { body: "!askpolli" },
                },
            }),
            true,
        );
    }
});

test("read PR-only IDs authorize PR events and deny issue events", () => {
    for (const id of prOnlyIds) {
        assert.equal(
            invoke({
                id,
                mode: "read",
                event: {
                    sender: { id, login: "maintainer" },
                    issue: { number: 1, pull_request: {} },
                    comment: { body: "!askpolli" },
                },
            }),
            true,
        );
        assert.equal(
            invoke({
                id,
                mode: "read",
                event: {
                    sender: { id, login: "maintainer" },
                    issue: { number: 1 },
                    comment: { body: "!askpolli" },
                },
            }),
            false,
        );
    }
});

test("PR-only IDs cannot write on any PR event", () => {
    const events = [
        [
            "issue_comment",
            {
                issue: { number: 1, pull_request: {} },
                comment: { body: "!polli" },
            },
        ],
        [
            "pull_request_review_comment",
            { pull_request: { number: 1 }, comment: { body: "!polli" } },
        ],
        [
            "pull_request_review",
            { pull_request: { number: 1 }, review: { body: "!polli" } },
        ],
    ];
    for (const id of prOnlyIds) {
        for (const [eventName, event] of events) {
            assert.equal(
                invoke({
                    id,
                    eventName,
                    event: { ...event, sender: { id, login: "maintainer" } },
                }),
                false,
            );
        }
    }
});

test("PR-only IDs cannot read issue opened or assigned events", () => {
    for (const id of prOnlyIds) {
        for (const action of ["opened", "assigned"]) {
            assert.equal(
                invoke({
                    id,
                    mode: "read",
                    eventName: "issues",
                    event: {
                        sender: { id, login: "maintainer" },
                        action,
                        issue: { number: 1, title: "!askpolli", body: null },
                    },
                }),
                false,
            );
        }
    }
});

test("rejects malformed identities and cross-mode commands", () => {
    assert.equal(
        invoke({
            event: {
                sender: { id: writeIds[0], login: "maintainer" },
                issue: { number: 1 },
                comment: { body: "!polli," },
            },
        }),
        false,
    );
    assert.equal(
        invoke({
            event: {
                sender: { id: writeIds[0], login: "maintainer" },
                issue: { number: 1 },
                comment: { body: "x!polli" },
            },
        }),
        false,
    );
    assert.equal(invoke({ actor: "other" }), false);
    assert.equal(invoke({ triggeringActor: "other" }), false);
    assert.equal(invoke({ id: "5099901" }), false);
    assert.equal(invoke({ id: 999 }), false);
    assert.equal(
        invoke({
            event: {
                sender: { login: "maintainer" },
                issue: { number: 1 },
                comment: { body: "!polli" },
            },
        }),
        false,
    );
    assert.equal(
        invoke({
            mode: "write",
            event: {
                sender: { id: writeIds[0], login: "maintainer" },
                issue: { number: 1 },
                comment: { body: "!askpolli" },
            },
        }),
        false,
    );
    assert.equal(
        invoke({
            mode: "read",
            event: {
                sender: { id: writeIds[0], login: "maintainer" },
                issue: { number: 1 },
                comment: { body: "!polli" },
            },
        }),
        false,
    );
    assert.equal(
        invoke({
            event: {
                sender: { id: writeIds[0], login: "maintainer" },
                issue: {},
                comment: { body: "!polli" },
            },
        }),
        false,
    );
});
