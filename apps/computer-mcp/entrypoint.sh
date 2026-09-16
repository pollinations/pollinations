#!/bin/sh
# sshd is reachable only through Gen's owner-authenticated WebSocket; keys live
# in /workspace so they survive restarts. Host keys are regenerated per boot.
set -e
ssh-keygen -A >/dev/null
mkdir -p /run/sshd
/usr/sbin/sshd
exec /usr/local/bin/computerd "$@"
