# Retell AI

Canonical vendor: `retell`

Status: inactive. Retell was used for an AI-agent experiment and is not part of
the normal monthly refresh.

Collection method: dashboard.

- Use the archived Retell invoices as historical cost evidence.
- If Retell is used again, reactivate it in the provider registry, add its
  authenticated dashboard URL, and collect exact calendar-month usage before
  publishing any compute-ledger rows.
- Separate phone-number rental (`subscription`) from model usage (`inference`).
  The registry classifies the subscription in Compute, but it is not a model
  meter. Keep invoice costs negative in `paid`; do not flip their sign when
  correcting the type. Prefer a detailed usage export when available.
