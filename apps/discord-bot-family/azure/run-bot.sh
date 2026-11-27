#!/bin/sh
set -eu
umask 077
export PATH=/usr/local/bin:/usr/bin:/bin
cd "$(dirname "$0")"
test -f .enabled || exit 0
exec flock -n .bot.lock sh -c '
    test -f .enabled || exit 0
    echo "$$" > .bot.pid
    exec /usr/local/bin/node --import tsx bot.ts >> bot.log 2>&1
'
