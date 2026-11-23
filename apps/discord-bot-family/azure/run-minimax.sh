#!/bin/sh
set -eu
umask 077
export PATH=/usr/local/bin:/usr/bin:/bin
cd "$(dirname "$0")"
test "$(stat -c %a .env)" = 600
set -a
. ./.env
set +a
export DISCORD_BOT_TOKEN="${BOT_TOKEN_MINIMAX:?Missing BOT_TOKEN_MINIMAX}"
unset BOT_TOKEN_MINIMAX
test -n "${TEXT_POLLINATIONS_TOKEN:?Missing TEXT_POLLINATIONS_TOKEN}"
exec flock -n -F .bot.lock /usr/local/bin/node --import tsx src-functional/cli.ts minimax \
    --channels 1485376399211499643,1123617013433110578 \
    --global-channels 1370368057641533440,1123617013433110578
