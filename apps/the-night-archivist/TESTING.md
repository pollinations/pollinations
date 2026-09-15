# Test evidence — the-night-archivist

Tested live against the deployed agent `rekty/the-night-archivist` (agent id `92c7d20e-3ba5-4f18-b7f5-02e2aef6bd29`) on 2026-09-15, via `POST https://gen.pollinations.ai/v1/chat/completions`. Each numbered exchange is a **separate conversation** (single-message request, no shared chat history) — exactly the "fresh conversation" condition of the quest.

Note: one early behavior was caught and fixed during testing — the base model liked to wrap commands in `bash -lc`, which the Computer sandbox rejects. The system prompt now carries literal command recipes; after the fix every conversation below ran with **zero failed tool calls** (transcripts trimmed to the reply text; tool-call blocks removed for readability).

## Reset

> **User:** "Forget everything you know about me."
>
> **Quill:** "Welcome to the Midnight Archive, a brand-new ledger for your visit. I shall remember only what you choose to share…"

## 1. Remember two facts

> **User:** "Please remember two things: my name is Ada, and I am afraid of deep water."
>
> **Quill:** "Inscribed. The Archive now bears your two notes: - my name is Ada; - I am afraid of deep water. Would you like me to add more details to Ada's file?"

Ledger written to `/workspace/memory/visitor.md` via `mkdir -p /workspace/memory && cat > /workspace/memory/visitor.md`.

## 2. Fresh conversation — recall (no chat history)

> **User:** "Do you know me? What is my name?"
>
> **Quill:** "Yes. The ledger remembers you as Ada. I also recall that you are afraid of deep water. Would you like me to show the full archive register?"

## 3. Show the ledger

> **User:** "Show me the full ledger."
>
> **Quill:** "Behold the Archive's register, by the glow of a solitary candle: - my name is Ada - I am afraid of deep water. Would you like me to inscribe more words on these pages?"

## 4. Forget exactly one fact

> **User:** "Forget that I am afraid of deep water, but keep my name."
>
> **Quill:** "The line '- I am afraid of deep water' has been burned from the page. The ledger now contains: - my name is Ada."

## 5. Verify after forgetting

> **User:** "Now what do you remember about me?"
>
> **Quill:** "From the Archive's register, by the soft glow of the lamp: - my name is Ada."

## 6. Forget everything → anonymous again

> **User:** "Forget everything you know about me."
>
> **Quill:** "The ledger has been wiped clean; you are anonymous again in the Midnight Archive. I will not recall past hints or names unless you inscribe them anew."

The next conversation starts from a missing file — the brand-new-visitor path.

## Isolation between users

Memory lives in each caller's own Computer filesystem: the gen proxy authenticates the caller and selects the Durable Object via `x-pollinations-user-id` before the agent runs, so two different accounts have two different `/workspace/memory/visitor.md` files. Verified by the platform design (see `apps/computer-mcp/README.md`: "Nothing is shared between users"); each account's ledger is reachable only through its own authenticated MCP calls.

## Cost

The agent itself is free to run; callers pay base-model tokens (`openai-fast`) plus Computer tool calls (`computer.tool_call.v1`, preview price). A full remember→recall→show→forget cycle in these tests consumed well under 0.01 pollen.
