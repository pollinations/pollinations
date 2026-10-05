# Pi in the browser — end-to-end run

- Date: 2026-10-05T12:05:54.127Z
- Browser: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36
- Page: http://localhost:5173/ (cross-origin isolated: true)
- Model: openai/gpt-5.4-nano
- Prompt: Create a file hello.txt containing the single word bridge-ok, then run `cat hello.txt` and show me the output.
- Model calls bridged: 3
- Bridge self-test: omitted — see loaded.txt in Bridge queue
- Bridge queue: pending=[] done=[] loaded={"version":"v24.13.2","argv":["/bin/edge","/opt/pi/dist/bundle/cli.js","--model","openai/gpt-5.4-nano"],"nodeOptions":"--import=/workspace/bridge.mjs","at":"2026-10-05T12:05:40.614Z"} guestError=missing(filesystem operation `open` failed for `/workspace/.bridge/error.txt`: entry not found) calls=blocked foreign fetch install
blocked foreign fetch install
blocked foreign fetch install
call GET https://pi.dev/api/report-install?version=1.0.0
blocked foreign fetch install
call GET https://pi.dev/api/latest-version
call POST https://gen.pollinations.ai/v1/chat/completions
call POST https://gen.pollinations.ai/v1/chat/completions
call POST https://gen.pollinations.ai/v1/chat/completions
 workspace=[bridge.mjs,.pi,.bridge,hello.txt] sample=
- Guest env: omitted (spawning guest commands crashed the worker)

## Terminal

```text
▀▀█  v1.0.0                                                                                                           
 █▀ █ escape interrupt · ctrl+c/ctrl+d clear/exit · / commands · ! bash · ctrl+o more                                  
 Press ctrl+o to show full startup help and loaded resources.                                                          
                                                                                                                       
 Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.                                 
                                                                                                                       
 Create a file hello.txt containing the single word bridge-ok, then run cat hello.txt and show me the output.          
                                                                                                                       
                                                                                                                       
 write hello.txt                                                                                                       
                                                                                                                       
 bridge-ok                                                                                                             
                                                                                                                       
                                                                                                                       
 $ cat hello.txt                                                                                                       
                                                                                                                       
 bridge-ok                                                                                                             
                                                                                                                       
 Took 0.2s                                                                                                             
                                                                                                                       
 bridge-ok                                                                                                             
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
                                                                                                                       
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
~
↑2.4k ↓46 R1.2k CH94.1% 0.3%/400k (auto)                                                            openai/gpt-5.4-nano
```

## Model calls through the bridge

```text
200 POST /v1/chat/completions
200 POST /v1/chat/completions
200 POST /v1/chat/completions
```

## Files in /workspace

```text
bridge.mjs
hello.txt
```

## Console errors

```text
Failed to load resource: the server responded with a status of 404 (Not Found)
```
