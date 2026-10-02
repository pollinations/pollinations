# Sourced by login shells in the `pollinations` template. Gen writes polli's
# login into each new sandbox (gen.pollinations.ai/src/routes/e2b.ts), a
# staging gen a staging one; the first interactive login then connects the
# coding harnesses to Pollinations with that key.

if [ ! -f ~/.pollinations/credentials.json ] &&
    [ -f ~/.pollinations/credentials.staging.json ]; then
    export POLLINATIONS_ENV=staging
fi

case $- in
*i*) ;;
*) return 0 ;;
esac

# mkdir succeeds once, so a second login at the same time skips this.
if [ "$(id -u)" != 0 ] &&
    ls ~/.pollinations/credentials*.json >/dev/null 2>&1 &&
    mkdir ~/.pollinations/harnesses 2>/dev/null; then
    chmod 600 ~/.pollinations/credentials*.json
    echo "Connecting the coding harnesses to Pollinations (first login only)..."
    # Claude Code's harness configures Claude Code Router through its service.
    ccr start >/dev/null 2>&1 &
    sleep 2
    pids=""
    for harness in opencode pi hermes openclaw claude-code; do
        (
            log=~/.pollinations/harnesses/$harness.log
            if polli harness "$harness" on >"$log" 2>&1; then
                echo "  $harness: ready"
            else
                echo "  $harness: failed, see $log"
            fi
        ) &
        pids="$pids $!"
    done
    # Not plain `wait`: the router keeps running.
    wait $pids
fi
