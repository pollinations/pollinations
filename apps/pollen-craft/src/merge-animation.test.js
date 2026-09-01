import assert from "node:assert/strict";
import test from "node:test";
import {
    createMergeAnimation,
    createMergeAnimationLifecycle,
    getMergePhase,
    orbitPoint,
    sparklePoint,
    visualMidpoint,
} from "./merge-animation.js";

class FakeElement {
    constructor() {
        this.children = [];
        this.parentElement = null;
        this.dataset = {};
        this.style = {
            setProperty(name, value) {
                this[name] = value;
            },
        };
        const classes = new Set();
        this.classList = {
            add: (...values) => {
                values.forEach((value) => {
                    classes.add(value);
                });
            },
            remove: (...values) => {
                values.forEach((value) => {
                    classes.delete(value);
                });
            },
            contains: (value) => classes.has(value),
        };
    }

    append(...nodes) {
        for (const node of nodes) {
            node.parentElement = this;
            this.children.push(node);
        }
    }

    remove() {
        if (!this.parentElement) return;
        this.parentElement.children = this.parentElement.children.filter(
            (child) => child !== this,
        );
        this.parentElement = null;
    }

    setAttribute() {}

    querySelector(selector) {
        return selector === ".element-visual" ? this.visual : null;
    }

    cloneNode() {
        return new FakeElement();
    }
}

function fakeSource(tone) {
    const source = new FakeElement();
    source.dataset.tone = tone;
    source.visual = new FakeElement();
    return source;
}

test("visual midpoint uses the centers of unequal source rectangles", () => {
    assert.deepEqual(
        visualMidpoint(
            { left: 100, top: 40, width: 80, height: 44 },
            { left: 260, top: 100, width: 180, height: 60 },
            { left: 20, top: 10 },
        ),
        { x: 225, y: 86 },
    );
});

test("lifecycle keeps concurrent operations isolated", async () => {
    let now = 0;
    const timers = new Map();
    const lifecycle = createMergeAnimationLifecycle({
        duration: 340,
        setTimer(callback, delay) {
            const id = ++now;
            timers.set(id, { callback, delay });
            return id;
        },
        clearTimer(id) {
            timers.delete(id);
        },
    });
    const first = lifecycle.begin("first");
    const second = lifecycle.begin("second");
    assert.equal(lifecycle.size, 2);
    first.cancel();
    assert.equal(await first.promise, false);
    assert.equal(lifecycle.size, 1);
    [...timers.values()][0].callback();
    assert.equal(await second.promise, true);
    assert.equal(lifecycle.size, 0);
});

test("fast API completion can wait for the visual lifecycle", async () => {
    const lifecycle = createMergeAnimationLifecycle({
        reducedMotion: true,
    });
    const operation = lifecycle.begin("ready");
    assert.equal(await operation.promise, true);
    assert.equal(lifecycle.size, 0);
});

test("failure, cancel, reset, and stale callbacks leave no active lifecycle", async () => {
    const lifecycle = createMergeAnimationLifecycle({
        duration: 340,
        setTimer: (callback) => setTimeout(callback, 0),
    });
    const failure = lifecycle.begin("failure");
    const cancelled = lifecycle.begin("cancelled");
    cancelled.cancel();
    assert.equal(await cancelled.promise, false);
    assert.equal(await failure.promise, true);
    lifecycle.begin("reset-one");
    lifecycle.begin("reset-two");
    lifecycle.cancelAll();
    lifecycle.cancel("stale");
    assert.equal(lifecycle.size, 0);
});

test("reduced motion resolves without waiting for timers", async () => {
    let scheduled = false;
    const lifecycle = createMergeAnimationLifecycle({
        reducedMotion: true,
        setTimer: () => {
            scheduled = true;
            return 1;
        },
    });
    assert.equal(await lifecycle.begin("reduced").promise, true);
    assert.equal(scheduled, false);
});

test("resize rebases two active merge anchors independently", () => {
    const canvasRect = { left: 10, top: 20 };
    const operations = [
        {
            id: "pending",
            apiState: "pending",
            first: { left: 40, top: 50, width: 80, height: 44 },
            second: { left: 220, top: 80, width: 120, height: 44 },
        },
        {
            id: "result",
            apiState: "success",
            first: { left: 80, top: 220, width: 160, height: 44 },
            second: { left: 300, top: 260, width: 80, height: 44 },
        },
    ];
    const anchors = new Map(
        operations.map((operation) => [
            operation.id,
            visualMidpoint(operation.first, operation.second, canvasRect),
        ]),
    );
    assert.deepEqual(anchors.get("pending"), { x: 170, y: 67 });
    assert.deepEqual(anchors.get("result"), { x: 240, y: 242 });
    assert.notDeepEqual(anchors.get("pending"), anchors.get("result"));
});

test("merge phase keeps fast responses waiting and slow responses resolving", () => {
    assert.equal(
        getMergePhase({ apiState: "pending", elapsedMs: 10 }),
        "waiting",
    );
    assert.equal(
        getMergePhase({ apiState: "success", elapsedMs: 300 }),
        "waiting",
    );
    assert.equal(
        getMergePhase({ apiState: "success", elapsedMs: 620 }),
        "resolving",
    );
    assert.equal(
        getMergePhase({ apiState: "failure", elapsedMs: 620 }),
        "idle",
    );
});

test("orbit and sparkle geometry is deterministic and operation-safe", () => {
    const first = orbitPoint({ x: 100, y: 80 }, 0);
    const second = orbitPoint({ x: 100, y: 80 }, 1);
    assert.deepEqual(first, { x: 100, y: 42, angle: -90 });
    assert.deepEqual(second, { x: 100, y: 118, angle: 90 });
    assert.ok(Math.abs(sparklePoint(0, 8).x) < 1e-9);
    assert.equal(sparklePoint(0, 8).y, -52);
    assert.equal(new Set([first.angle, second.angle]).size, 2);
});

test("reduced motion completes immediately without an orbit phase", () => {
    assert.equal(
        getMergePhase({
            apiState: "success",
            elapsedMs: 0,
            reducedMotion: true,
        }),
        "complete",
    );
});

test("resolution keeps orbit tokens and sparkles scoped to the midpoint", async () => {
    const previousDocument = globalThis.document;
    const layer = new FakeElement();
    const timers = [];
    let completed = 0;
    globalThis.document = {
        createElement: () => new FakeElement(),
    };
    try {
        const animation = createMergeAnimation({
            canvas: {
                getBoundingClientRect: () => ({ left: 10, top: 20 }),
            },
            layer,
            now: () => 0,
            setTimer: (callback, delay) => {
                timers.push({ callback, delay });
                return timers.length;
            },
            clearTimer: () => {},
        });
        const visual = animation.begin({
            id: "orbit",
            sourceElements: [
                {
                    dataset: { tone: "lavender" },
                    getBoundingClientRect: () => ({
                        left: 30,
                        top: 40,
                        width: 40,
                        height: 40,
                    }),
                    querySelector: () => fakeSource("lavender").visual,
                },
                {
                    dataset: { tone: "mint" },
                    getBoundingClientRect: () => ({
                        left: 170,
                        top: 80,
                        width: 40,
                        height: 40,
                    }),
                    querySelector: () => fakeSource("mint").visual,
                },
            ],
            onComplete: () => {
                completed += 1;
            },
        });
        assert.deepEqual(visual.midpoint, { x: 110, y: 60 });
        const orbit = layer.children[0];
        assert.equal(orbit.children.length, 4);
        assert.equal(orbit.children[0].className, "merge-orbit-ring");
        assert.equal(orbit.children[1].className, "merge-orbit-token");
        assert.equal(orbit.children[2].className, "merge-orbit-token");
        assert.equal(orbit.children[3].className, "merge-orbit-label");
        assert.equal(animation.size, 1);
        assert.equal(animation.resolve("orbit"), true);
        timers.shift().callback();
        assert.equal(
            orbit.children.filter(
                (child) => child.className === "merge-sparkle",
            ).length,
            8,
        );
        assert.equal(layer.children.length, 1);
        assert.ok(
            orbit.children.every((child) => child.parentElement === orbit),
        );
        timers.shift().callback();
        assert.equal(await visual.promise, true);
        assert.equal(completed, 1);
        assert.equal(layer.children.length, 0);
    } finally {
        globalThis.document = previousDocument;
    }
});
