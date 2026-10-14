## Review of https://github.com/pollinations/pollinations/pull/17449

The change correctly converts SDK image URL arrays to the edits endpoint’s documented object-array shape while preserving single-string inputs. The added regression test covers the previously broken multi-image request body; no defects are evident in the supplied diff.

No defects found in this diff.

No fix prepared.

_model openai/gpt-6.1-sol_
