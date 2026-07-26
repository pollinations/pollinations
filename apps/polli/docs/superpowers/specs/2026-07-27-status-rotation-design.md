# Polli status rotation

Polli rotates a curated pool of Discord custom-status easter eggs every five minutes. The pool mixes Polli/Pollinations lore, model and tool jokes, and occasional absurd one-liners.

## Behavior

- Start the rotation after Discord reports the bot ready.
- Set the first status immediately, then change it every five minutes.
- Shuffle the complete pool and pop each entry once, so nothing repeats until every status has appeared.
- When reshuffling, prevent the previous cycle's last status from becoming the new cycle's first status.
- Keep one loop across reconnects; repeated `on_ready` events must not start duplicate loops.
- Log Discord/API failures and retry naturally on the next five-minute tick.
- Rotations need no process restarts after the code is loaded.

## Implementation

Keep the predefined immutable status pool and small shuffle-bag helper in `apps/polli/src/bot.py`, beside the existing background-task logic. A `discord.ext.tasks.loop(minutes=5)` method on `PolliBot` changes presence with `discord.CustomActivity`. `setup_hook` starts the task once and `before_loop` waits for Discord readiness.

## Verification

- Unit-check the shuffle bag across multiple cycles: each cycle contains every status exactly once and boundaries never repeat.
- Compile/import `bot.py`.
- Deploy once, then observe at least two automatic status changes without another restart.
