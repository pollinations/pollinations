# Milo the Moonbase Mechanic

Milo is a small prompt-agent example that remembers only facts a user
explicitly asks it to keep. It stores those facts in
`/workspace/milo-moonbase/memories.md` through the Computer MCP. The dedicated
path is isolated per caller by the Computer MCP, so two users do not share
memories.

Try these in separate fresh conversations:

1. `Remember that my rover is called Pogo.`
2. `What do you remember about me?`
3. `Forget that my rover is called Pogo.`
4. `Forget everything.`

The prompt is intentionally small so it can be copied and customized for a
different character, setting, or memory-file path.
