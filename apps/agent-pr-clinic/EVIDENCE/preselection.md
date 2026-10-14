# Preselection

Chosen BEFORE any run, from the open pull-request list of pollinations/pollinations
(2026-10-14), to span different risk classes:

1. **#17453** (security hardening, mid-size diff) — the kind of change where a
   widened trust boundary is easy to ship by accident.
2. **#17447** (audio MIME parsing, small) — correctness of a narrow string fix.
3. **#17422** (SDK response semantics, medium) — API-surface behavior change.
4. **#17484** (new model wiring, small but 5 files) — cross-file consistency.

No PR by the operator was used. #17453 was also chosen because the review
harness was expected to be able to produce a pushable fix for it; the other
three are honest no-fix cases.
