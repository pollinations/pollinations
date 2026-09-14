# Mnemo

An NPC that remembers facts about you between conversations.

## How it works

Mnemo uses the **Computer MCP** to store memories in isolated text files. Each user has their own memory file, ensuring privacy and isolation.

## Features

- **Remembers facts** — stores personal details, preferences, stories
- **Isolated memory** — each user has their own file (`/tmp/mnemo_memory_<USER_ID>.txt`)
- **Recall** — ask "what do you remember?" to see stored facts
- **Forget** — say "forget everything" to delete your memory

## Usage

```bash
# Mnemo will automatically read your memory file before responding
# and append new facts as you share them
```

## Memory File Format

One fact per line:
```
Name: Alice
Loves cats
Works as a developer
Favorite color: blue
```

## Privacy

- Memories are stored per-user and never mixed
- Users can delete their memory at any time
- No external database — local file storage only
