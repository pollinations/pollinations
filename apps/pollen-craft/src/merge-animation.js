export const MERGE_MIN_WAIT_MS = 620;
export const MERGE_RESOLVE_DURATION_MS = 280;
export const MERGE_VISUAL_DURATION_MS =
    MERGE_MIN_WAIT_MS + MERGE_RESOLVE_DURATION_MS;

export function visualMidpoint(firstRect, secondRect, canvasRect) {
    return {
        x:
            (firstRect.left +
                firstRect.width / 2 +
                secondRect.left +
                secondRect.width / 2) /
                2 -
            canvasRect.left,
        y:
            (firstRect.top +
                firstRect.height / 2 +
                secondRect.top +
                secondRect.height / 2) /
                2 -
            canvasRect.top,
    };
}
export function getMergePhase({
    apiState = "pending",
    elapsedMs = 0,
    reducedMotion = false,
    minWaitMs = MERGE_MIN_WAIT_MS,
} = {}) {
    if (apiState === "failure" || apiState === "cancelled") return "idle";
    if (apiState !== "success") return "waiting";
    if (reducedMotion) return "complete";
    return elapsedMs >= minWaitMs ? "resolving" : "waiting";
}

export function orbitPoint(center, index, total = 2, radius = 38) {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
        angle: (angle * 180) / Math.PI,
    };
}

export function sparklePoint(index, total = 8, radius = 52) {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const distance = radius + (index % 3) * 7;
    return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
    };
}

export function createMergeAnimationLifecycle({
    duration = MERGE_MIN_WAIT_MS,
    reducedMotion = false,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
} = {}) {
    const active = new Map();

    function finish(operation, completed) {
        if (operation.settled) return;
        operation.settled = true;
        if (operation.timer !== null) clearTimer(operation.timer);
        active.delete(operation.id);
        operation.settle(completed);
    }

    return {
        begin(id) {
            active.get(id)?.cancel();
            let resolve;
            const promise = new Promise((next) => {
                resolve = next;
            });
            const operation = {
                id,
                timer: null,
                settled: false,
                settle: resolve,
                cancel() {
                    finish(operation, false);
                },
            };
            active.set(id, operation);
            if (reducedMotion) finish(operation, true);
            else
                operation.timer = setTimer(
                    () => finish(operation, true),
                    duration,
                );
            return { promise, cancel: operation.cancel };
        },
        cancel(id) {
            active.get(id)?.cancel();
        },
        cancelAll() {
            for (const operation of active.values()) operation.cancel();
        },
        get size() {
            return active.size;
        },
    };
}
export function createMergeAnimation({
    canvas,
    layer,
    minWait = MERGE_MIN_WAIT_MS,
    resolveDuration = MERGE_RESOLVE_DURATION_MS,
    reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")
        .matches ?? false,
    now = () => performance.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
} = {}) {
    const active = new Map();

    function removeNodes(operation) {
        for (const node of operation.nodes) node.remove();
        operation.nodes = [];
    }

    function finish(operation, completed) {
        if (operation.settled) return;
        operation.settled = true;
        clearTimer(operation.waitTimer);
        clearTimer(operation.resolveTimer);
        removeNodes(operation);
        active.delete(operation.id);
        if (completed) operation.onComplete?.();
        operation.settle(completed);
    }

    function appendSparkles(operation) {
        const sparkleCount = 8;
        for (let index = 0; index < sparkleCount; index += 1) {
            const sparkle = document.createElement("span");
            sparkle.className = "merge-sparkle";
            sparkle.setAttribute("aria-hidden", "true");
            const point = sparklePoint(index, sparkleCount);
            sparkle.style.setProperty("--sparkle-x", `${point.x}px`);
            sparkle.style.setProperty("--sparkle-y", `${point.y}px`);
            sparkle.style.setProperty("--sparkle-delay", `${index * 18}ms`);
            sparkle.dataset.sparkleTone =
                index % 3 === 0 ? "yellow" : index % 2 ? "lavender" : "lime";
            operation.orbit.append(sparkle);
            operation.nodes.push(sparkle);
        }
    }

    function beginResolve(operation) {
        if (operation.settled || operation.phase !== "waiting") return;
        operation.phase = "resolving";
        operation.waitTimer = null;
        if (reducedMotion) {
            finish(operation, true);
            return;
        }
        operation.orbit.classList.remove("is-orbiting");
        operation.orbit.classList.add("is-resolving");
        appendSparkles(operation);
        operation.resolveTimer = setTimer(
            () => finish(operation, true),
            resolveDuration,
        );
    }

    return {
        begin({ id, sourceElements = [], onComplete } = {}) {
            active.get(id)?.cancel();
            let resolve;
            const promise = new Promise((next) => {
                resolve = next;
            });
            const operation = {
                id,
                nodes: [],
                orbit: null,
                waitTimer: null,
                resolveTimer: null,
                startedAt: now(),
                phase: "waiting",
                settled: false,
                settle: resolve,
                requestResolve: null,
                onComplete,
                cancel() {
                    finish(operation, false);
                },
            };
            active.set(id, operation);

            const canvasRect = canvas?.getBoundingClientRect?.();
            const sourceRects = sourceElements.map((element) =>
                element.getBoundingClientRect(),
            );
            const midpoint =
                canvasRect && sourceRects.length >= 2
                    ? visualMidpoint(sourceRects[0], sourceRects[1], canvasRect)
                    : null;
            if (!midpoint || !layer) {
                queueMicrotask(() => finish(operation, true));
                return { promise, cancel: operation.cancel, midpoint };
            }

            const orbit = document.createElement("span");
            orbit.className = "merge-orbit is-orbiting";
            orbit.setAttribute("aria-hidden", "true");
            orbit.style.left = `${midpoint.x}px`;
            orbit.style.top = `${midpoint.y}px`;
            const ring = document.createElement("span");
            ring.className = "merge-orbit-ring";
            orbit.append(ring);
            for (const [index, source] of sourceElements.entries()) {
                const token = document.createElement("span");
                token.className = "merge-orbit-token";
                token.dataset.tone = source.dataset.tone ?? "lime";
                const visual = source.querySelector(".element-visual");
                if (visual) {
                    const icon = visual.cloneNode(true);
                    icon.setAttribute("aria-hidden", "true");
                    token.append(icon);
                } else token.textContent = "✦";
                const point = orbitPoint({ x: 0, y: 0 }, index);
                token.style.setProperty("--merge-angle", `${point.angle}deg`);
                token.style.setProperty("--merge-radius", "38px");
                orbit.append(token);
            }
            const label = document.createElement("span");
            label.className = "merge-orbit-label";
            label.textContent = "Combining…";
            orbit.append(label);
            layer.append(orbit);
            operation.orbit = orbit;
            operation.nodes.push(orbit);
            const requestResolve = () => {
                if (operation.settled || operation.phase !== "waiting")
                    return false;
                const elapsed = now() - operation.startedAt;
                const wait = reducedMotion ? 0 : Math.max(0, minWait - elapsed);
                clearTimer(operation.waitTimer);
                if (reducedMotion)
                    queueMicrotask(() => beginResolve(operation));
                else
                    operation.waitTimer = setTimer(
                        () => beginResolve(operation),
                        wait,
                    );
                return true;
            };
            operation.requestResolve = requestResolve;
            return {
                promise,
                cancel: operation.cancel,
                midpoint,
                requestResolve,
            };
        },
        resolve(id) {
            const operation = active.get(id);
            return operation?.requestResolve?.() ?? false;
        },
        cancel(id) {
            active.get(id)?.cancel();
        },
        cancelAll() {
            for (const operation of active.values()) operation.cancel();
        },
        get size() {
            return active.size;
        },
    };
}
