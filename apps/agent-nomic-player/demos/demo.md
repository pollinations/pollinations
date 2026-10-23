# Nomic Player — live demos (3 runs, different Jev decisions)

Agent: `community/ammarelshaf3y/nomic-player`
(agent ID `3b37b51a-32c5-4bbb-a27b-355cf00d6bed`, code agent, private).
Every run: Jev (`POST /alpha/decisions`, `choice` yes/no) decides,
a text model argues, trace carries verdict + probabilities.

## 1. Strict proverb rule → NO (0.47 / 0.53)

Input: `Proposal: every proposal must include exactly one line
containing a desert proverb.`

Trace: `[nomic-player: jev voted no {"yes":0.47,"no":0.53}]`
Argument: strict one-proverb rule micromanages expression — vote no.

## 2. Public named vote records → NO (0.05 / 0.95)

Input: `Proposal: all votes must be recorded publicly with the
voter's name and date so the game history stays transparent.`

Trace: `[nomic-player: jev voted no {"yes":0.05,"no":0.95}]`
Argument: named public votes chill honest participation — vote no.
Same verdict as run 1, sharply different probabilities.

## 3. Herald reads summaries aloud → YES (0.61 / 0.39)

Input: `Proposal: the herald reads a one-line summary of each new
proposal aloud so every voter knows what is being voted on.`

Trace: `[nomic-player: jev voted yes {"no":0.39,"yes":0.61}]`
Argument: clear summaries keep votes informed and fair — vote yes.
Different verdict from runs 1-2, proving input-sensitive decisions.
