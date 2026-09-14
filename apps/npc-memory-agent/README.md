# NPC Memory Agent

A friendly NPC companion who genuinely remembers you across conversations. Built as a **prompt agent** using the Computer MCP for persistent memory.

## Features

- **Cross-session memory** — Remembers facts across fresh chat histories
- **Structured facts file** — `/workspace/memory/facts.md` with identity, preferences, context, relationships
- **Append-only journal** — Dated entries in `/workspace/memory/log/`
- **Memory management** — Show, add, update, and forget individual facts on request
- **Conflict resolution** — Updates preferences when they change, preserving context
- **User isolation** — Each user gets their own memory space (enforced by Computer MCP)
- **Pure prompt agent** — No code, just a structured system prompt + Computer MCP

## How It Works

The agent uses the Computer MCP's filesystem as its memory system:

| File | Purpose |
|------|---------|
| `/workspace/memory/facts.md` | Structured user profile (identity, preferences, context) |
| `/workspace/memory/log/YYYY-MM-DD.md` | Append-only journal of significant moments |

### Memory Protocol

1. **First conversation**: Creates `facts.md`, asks user's name
2. **During conversation**: Auto-saves facts, appends to journal on significant events
3. **New conversation**: Greets user by name, references something remembered
4. **"What do you remember?"**: Displays `facts.md` contents
5. **"Forget X"**: Removes specific fact from `facts.md`

### Example Session Flow

**First meeting:**
```
User: Hi!
Agent: Hey there! 👋 I'm your NPC companion. I don't think we've met before — what should I call you?
```

**Sharing facts:**
```
User: I'm Alex, and I'm building a hiking app.
Agent: Nice to meet you, Alex! 🥾 A hiking app sounds awesome. I'll remember that — what kind of features are you building?
```

**New session (persistence test):**
```
Agent: Hey Alex! 👋 Welcome back! How's the hiking app coming along? Did you figure out that trail API?
```

**Show memories:**
```
User: What do you remember about me?
Agent: Let me check... [displays your saved facts]. Anything you'd like to add or update?
```

**Forgetting:**
```
User: Forget that I like sushi.
Agent: Done! I've removed sushi from your preferences. 🍣❌ Anything else?
```

## Memory Quality Rules

- **Be specific**: "Loves hiking" → "Loves mountain trails in the Alps"
- **Resolve conflicts**: Update preferences when they change
- **Categorize correctly**: Facts stay in the right section
- **Be concise**: Bullet points, not paragraphs
- **Respect privacy**: Only remember what's explicitly shared

## Testing the Persistence

To verify cross-session memory works:

1. Start a conversation with the agent
2. Share some personal facts (name, projects, preferences)
3. **Open a completely new chat** (no previous history)
4. The agent should greet you by name and reference something you shared
5. Ask "What do you remember about me?" to see all stored facts

## Agent Configuration

```json
{
  "name": "npc-memory-agent",
  "title": "NPC Memory Agent",
  "description": "A friendly NPC companion who remembers you across conversations.",
  "baseModel": "openai",
  "mcpServers": ["computer"]
}
```

## Reward

- **15 Pollen** for the clearest, smallest working solution
- PR must include public repository link and deployed agent ID

## License

MIT
