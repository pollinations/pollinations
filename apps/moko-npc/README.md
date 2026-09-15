# Moko — The Remembering Fox

A cheerful desert fox NPC that remembers you between conversations. Part of the Build-an-NPC-that-remembers quest (Fixes #14821).

## What it does
- Remembers facts you ask it to keep (e.g. "remember my favorite color is teal").
- Recalls them in a fresh conversation with no chat history.
- Shows its memories and can forget them on request.
- Isolates every user's memories — nothing shared.

## How
A lightweight prompt agent that uses the Pollinations Computer MCP as its private, per-user memory store. It appends remembered facts to /workspace/memory/facts.md and reads them back at the start of each conversation. No vector DB, no custom frontend, no new service.

## Deploy (polli CLI)
    polli agents create --config agent.json --name moko-npc --title "Moko the Remembering Fox"

Callable model ID once deployed: mhmdrizzzki/moko-npc

## Try it
    polli gen text --model mhmdrizzzki/moko-npc "remember my favorite color is teal"
    polli gen text --model mhmdrizzzki/moko-npc "what do you remember about me?"
    polli gen text --model mhmdrizzzki/moko-npc "forget my memories"

## Customize
Change systemPrompt in agent.json for a different theme/personality, swap baseModel, or edit mcpServers.

## Demonstration (recorded against mhmdrizzzki/moko-npc)
1. Remember -> "Remember that my favorite color is teal and I am building a robot dog." -> Moko appends both facts to /workspace/memory/facts.md.
2. Fresh-chat recall -> "What is my favorite color?" -> reads facts.md -> "favorite color: teal".
3. Show -> "What facts do you have on file?" -> lists "- favorite color: teal / - building: robot dog".
4. Forget -> "forget my memories" -> removes the file and confirms.

Fixes #14821
