# polli CLI demo — writes the LinkedIn post announcing itself.
# Scene 1 sets up an `announce` function that prints a bold title
# AND kicks off backgrounded TTS — so every later scene is a one-liner.

Output demo-silent.mp4

Require polli

Set Shell "bash"
Set FontFamily "Menlo"
Set FontSize 16
Set Width 960
Set Height 720
Set Padding 40
Set Margin 24
Set MarginFill "#1a1b26"
Set BorderRadius 10
Set Theme "tokyonight-storm"
Set TypingSpeed 12ms
Set Framerate 20
Set CursorBlink true

Hide
# render.sh already cd's into the example dir; no `cd` needed here.
Type "export FORCE_COLOR=1"
Enter
Type "export PS1='» '"
Enter
Type "export PS2='» '"
Enter
Type "PROMPT_COMMAND='echo'"
Enter
Type "set +m"
Enter
Type "clear"
Enter
Show

Sleep 800ms

# ============================================================
# Scene 1 — orient + set up the announce helper
# ============================================================
Type "polli --help"
Sleep 200ms
Enter
Sleep 4000ms

# Define announce: print bold purple title, speak it in the background
Type `announce() { printf '\n\033[1;38;5;141m»» %s\033[0m\n\n' "$(sed -E 's/\[[^]]*\] *//g' <<< "$1")"; ( polli gen audio --play --output /tmp/narr-$$-$RANDOM.mp3 "$1" >/dev/null 2>&1 & ); }`
Sleep 200ms
Enter
Sleep 1200ms

# First use: polli's own tagline as the kickoff announcement
Type `announce "i am polli C L I. [whispers] for humans, agents, and everything in between"`
Sleep 200ms
Enter
Sleep 12500ms

Type "clear"
Enter
Sleep 300ms

# ============================================================
# Scene 2 — theme + soundtrack
# ============================================================
Type `announce "first — [excited] let's compose some music with pollinations"`
Sleep 200ms
Enter
Sleep 3000ms

Type `( polli gen audio --model elevenmusic --instrumental --play "boom bap, wonky beats, lofi instrumental hip hop, warm analog, jazzy bass" >/dev/null 2>&1 & )`
Sleep 200ms
Enter
# Backgrounded — shell returns instantly; music API runs in parallel (~25s) then plays
Sleep 5000ms

Type "clear"
Enter
Sleep 300ms

# ============================================================
# Scene 3 — browse models
# ============================================================
Type `announce "what models can we use... [curious] to post to linkedin"`
Sleep 200ms
Enter
Sleep 2500ms

Type "polli models --type text | head -20"
Sleep 200ms
Enter
Sleep 6000ms

Type "clear"
Enter
Sleep 300ms

# ============================================================
# Scene 4 — payoff: perplexity-fast researches AND writes the post
# ============================================================
Type `announce "[confident] let's write our post"`
Sleep 200ms
Enter
Sleep 2500ms

Type `polli --help | polli gen text --model claude "↑ → linkedin post (no md · proportional font). polli = admin CLI (auth · keys · usage · models · docs · upload · gen). voice: hacker · whimsical · zen-terminal · .nfo/phrack irc-drop · emojis 🐝💾⚡🔮. 80–130w, sharp sign-off, no md, no cringe slang!!!"`
Sleep 200ms
Enter
# Hold so the streamed post is visible
Sleep 13000ms

# ============================================================
# Scene 5 — demoscene outro: ascii POLLI wordmark, streamed
# ============================================================
Type "clear"
Enter
Sleep 400ms

Type `announce "[playful] confused? just ask your agent to [whispers] install me... [curious] install me? [excited] install me!!"`
Sleep 200ms
Enter
Sleep 600ms

Type `polli gen text --model claude "ascii frame 50×20 — spell POLLI big block letters centered. organic evolving mycelium decor; demoscene!"`
Sleep 200ms
Enter
# Hold on the outro while ascii renders
Sleep 17000ms
