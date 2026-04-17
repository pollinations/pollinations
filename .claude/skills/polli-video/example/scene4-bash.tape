Output scene4-bash-silent.mp4
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
Type "cd /Users/thomash/Documents/GitHub/pollinations-fundraising/.claude/skills/polli-video/example"
Enter
Type "export FORCE_COLOR=1"
Enter
Type "export PS1='» '"
Enter
Type "clear"
Enter
Show

Sleep 1500ms

Type `announce() { polli gen audio --play --output /tmp/narr-$$-$RANDOM.mp3 "$1" >/dev/null 2>&1 & disown; }`
Sleep 200ms
Enter
Sleep 1200ms

Type `announce "[confident] now — let's write the post"`
Sleep 200ms
Enter
Sleep 2500ms

Type `polli --help | polli gen text --model glm --no-stream "↑ → linkedin post (no md · proportional font). polli = admin CLI (auth · keys · usage · models · docs · upload · gen). voice: hacker-genz · whimsical · zen-terminal · .nfo/phrack irc-drop · emojis 🐝💾⚡🔮. 80-130w · sharp sign-off · no md · no 🚀 · no corpo"`
Sleep 200ms
Enter
Sleep 20000ms
