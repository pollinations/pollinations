# Daily email review

The scheduled briefing is a read-only scan of the connected Pollinations Gmail
inbox specified by the operator in Codex. Run it on demand with the same scope
and the [email support skill](../SKILL.md).

- Review incoming messages from the preceding 24 hours, including relevant read
  and archived threads. Paginate, deduplicate by thread, and check the latest
  replies before treating a request or follow-up as outstanding.
- Report requests needing a reply, deadlines and follow-ups in the active chat.
  Link to Gmail threads when available. Skip routine promotions and automated
  notifications unless they require attention. If nothing needs action, say so
  in one line. Report access or scan gaps when they affect coverage.
- Keep mailbox state intact. Draft a reply in chat only on request. Use the
  [email support skill](../SKILL.md) for any subsequent case work and approval.
