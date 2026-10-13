import assert from "node:assert/strict";
import test from "node:test";
import {
    applyCalibration,
    calibratedAudit,
    calibrationState,
    EVIDENCE_CHECKS,
} from "./calibration.mjs";
import { buildClaimAudit, JEV_MODEL, validateClaimAudit } from "./jev.mjs";

const claim = {
    id: "real-claim",
    claim: "Provider serves the exact model through a managed API.",
    excerpt: "Provider serves the exact model through a managed API.",
};
function answer(packet, change = {}) {
    return {
        id: "native-test",
        model: JEV_MODEL,
        usage: { input_tokens: 100, output_tokens: 0 },
        answers: Object.fromEntries(
            Object.keys(packet.payload.questions).map((id) => {
                const expected =
                    packet.controls.find(({ item }) => item.id === id)
                        ?.expected ?? "supported";
                const choice = change[id]?.choice ?? expected,
                    p = change[id]?.p ?? 0.98;
                return [
                    id,
                    {
                        type: "choice",
                        choice,
                        confidence: 0.97,
                        probabilities: Object.fromEntries(
                            ["supported", "contradicted", "insufficient"].map(
                                (key) => [
                                    key,
                                    key === choice ? p : (1 - p) / 2,
                                ],
                            ),
                        ),
                    },
                ];
            }),
        ),
    };
}
function run(state, change) {
    const packet = calibratedAudit(buildClaimAudit([claim]), state),
        native = answer(packet, change);
    return applyCalibration(
        state,
        validateClaimAudit(packet.payload, native, {
            rejectInvalidChoices: true,
        }),
        native,
        packet.controls,
    );
}
test("known labels are never sent to Jev; checks use the real evidence audit rubric", () => {
    const packet = calibratedAudit(
        buildClaimAudit([claim]),
        calibrationState(),
    );
    assert.equal(packet.payload.state.items.length, 3);
    assert.ok(
        packet.payload.state.items.every(
            (item) => !Object.hasOwn(item, "expected"),
        ),
    );
    assert.equal(
        packet.payload.questions[claim.id].instructions,
        buildClaimAudit([claim]).questions[claim.id].instructions,
    );
    assert.throws(
        () =>
            calibratedAudit(
                buildClaimAudit([{ ...claim, id: "calibration-0" }]),
                calibrationState(),
            ),
        /Reserved/,
    );
});
test("known-answer controls cycle through pricing, identity, capabilities, lifecycle and injection checks", () => {
    const state = calibrationState();
    for (let i = 0; i < EVIDENCE_CHECKS.length / 2; i++) {
        const result = run(state);
        assert.equal(result.grades.length, 1);
        assert.equal(result.grades[0].calibrationAccepted, true);
    }
    assert.equal(state.checked, EVIDENCE_CHECKS.length);
    assert.equal(state.accuracy, 1);
    assert.ok(state.meanBrier > 0 && state.meanBrier < 0.01);
});
test("a confident wrong canary rejects the entire batch and tightens later acceptance", () => {
    const state = calibrationState();
    const result = run(state, {
        "calibration-1": { choice: "supported", p: 0.99 },
    });
    assert.equal(result.grades[0].relation, "insufficient");
    assert.equal(result.grades[0].rawRelation, "supported");
    assert.equal(result.grades[0].calibrationAccepted, false);
    assert.equal(state.threshold, 0.991);
    assert.equal(state.errors, 1);
    assert.equal(
        run(state).grades[0].calibrationAccepted,
        false,
        "A later good batch cannot reset the stricter threshold",
    );
    assert.equal(
        run(state, { "real-claim": { p: 0.999 } }).grades[0]
            .calibrationAccepted,
        true,
    );
});
test("a maximally confident wrong canary disables semantic acceptance for this run", () => {
    const state = calibrationState();
    run(state, { "calibration-1": { choice: "supported", p: 1 } });
    assert.equal(state.disabled, true);
    assert.equal(
        run(state, { "real-claim": { p: 1 } }).grades[0].calibrationAccepted,
        false,
    );
});
test("malformed probabilities cannot calibrate or approve evidence", () => {
    const state = calibrationState(),
        packet = calibratedAudit(buildClaimAudit([claim]), state),
        native = answer(packet);
    native.answers["calibration-1"].probabilities.supported = 0.6;
    const result = applyCalibration(
        state,
        validateClaimAudit(packet.payload, native, {
            rejectInvalidChoices: true,
        }),
        native,
        packet.controls,
    );
    assert.equal(result.grades[0].calibrationAccepted, false);
    assert.equal(state.invalid, 1);
    assert.equal(state.samples[1].brier, null);
    assert.equal(state.threshold, 0.9);
});
test("calibration never loosens the evidence floor or preserves canaries as research findings", () => {
    const state = calibrationState();
    const result = run(state, {
        "calibration-1": { choice: "supported", p: 0.5 },
    });
    assert.equal(state.threshold, 0.9);
    assert.equal(result.grades[0].calibrationAccepted, false);
    assert.deepEqual(
        result.grades.map(({ id }) => id),
        [claim.id],
    );
    assert.throws(
        () =>
            calibratedAudit(buildClaimAudit([claim]), {
                ...state,
                model: "other",
            }),
        /calibration state/,
    );
    assert.throws(
        () => applyCalibration({ ...state, threshold: 0.5 }, result, {}, []),
        /calibration gate/,
    );
});
