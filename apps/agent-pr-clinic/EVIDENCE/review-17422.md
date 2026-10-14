# Review of #17422 — NO-FIX

VERDICT: NO-FIX
ISSUES: none

The implementation returns the stored enclosure URL rather than the generation URL, and the optional `VideoResponse.url` type matches the missing-header behavior. The added test checks the stored URL, confirms `video()` still returns the buffer without an enclosure header, and verifies that `videoUrl()` rejects with `NO_VIDEO_URL`.

PATCH: none
