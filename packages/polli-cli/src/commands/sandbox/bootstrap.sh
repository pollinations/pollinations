#!/bin/bash
# Runs as root in a sandbox on every `ssh <id>.polli`; each step is
# idempotent. E2B sandboxes run systemd, which runs sshd once installed;
# Azure's run none, so sshd runs on its own there. E2B's
# base image sets `PermitEmptyPasswords yes` and `user` has no password, so
# sshd would accept a login without a key; the settings prepended below win
# because sshd uses the first value it reads.
# Env: POLLI_SSH_KEY (public key to allow), POLLI_SSH_PORT (WebSocket port).
set -e
if [ ! -x /usr/sbin/sshd ] || ! command -v rsync >/dev/null; then
    command -v apt-get >/dev/null || { echo "polli ssh needs a Debian-based template" >&2; exit 1; }
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-upgrade openssh-server rsync >/dev/null
fi
if [ ! -x /usr/local/bin/websocat ]; then
    curl -fsSL -o /tmp/websocat https://github.com/vi/websocat/releases/download/v1.14.1/websocat.x86_64-unknown-linux-musl
    echo "66f8dd3a0394761556339117f8bb5123bddefd44e087af2a72ec22b0bd08d514  /tmp/websocat" | sha256sum -c --quiet
    install -m 755 /tmp/websocat /usr/local/bin/websocat
fi
mkdir -p /run/sshd
ssh-keygen -A >/dev/null
# `start` leaves a running sshd as it is; `restart` makes it reread its config.
sshd_service() {
    if [ -d /run/systemd/system ]; then
        systemctl "$1" ssh
    elif [ -s /run/sshd.pid ] && kill -0 "$(cat /run/sshd.pid)" 2>/dev/null; then
        [ "$1" = start ] || kill -HUP "$(cat /run/sshd.pid)"
    else
        /usr/sbin/sshd
    fi
}
key_only() {
    test "$(sshd -T | grep -cxE '(permitemptypasswords|passwordauthentication|kbdinteractiveauthentication|permitrootlogin) no')" = 4
}
if key_only; then
    sshd_service start
else
    printf 'PermitEmptyPasswords no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n\n' |
        cat - /etc/ssh/sshd_config > /tmp/sshd_config
    cat /tmp/sshd_config > /etc/ssh/sshd_config
    key_only
    sshd_service restart
fi
install -d -m 700 -o user -g user /home/user/.ssh
touch /home/user/.ssh/authorized_keys
grep -qxF "$POLLI_SSH_KEY" /home/user/.ssh/authorized_keys || printf '%s\n' "$POLLI_SSH_KEY" >> /home/user/.ssh/authorized_keys
chown user:user /home/user/.ssh/authorized_keys
chmod 600 /home/user/.ssh/authorized_keys
# On one CPU: after a resume, an Azure box's CPUs disagree on the time by
# milliseconds, and websocat's timers abort when the time runs backwards.
if ! { [ -s /run/polli-ws.pid ] && kill -0 "$(cat /run/polli-ws.pid)" 2>/dev/null; }; then
    setsid nohup sh -c 'while :; do taskset -c 0 websocat -b -E "ws-l:0.0.0.0:$POLLI_SSH_PORT" tcp:127.0.0.1:22; sleep 1; done' >/dev/null 2>&1 </dev/null &
    echo $! > /run/polli-ws.pid
fi
# Templates with herdr, like `pollinations`, get its server, so agents in its
# panes keep running between ssh sessions. A fixed environment, not envd's.
# `herdr status server` exits 0 either way.
if [ -x /usr/local/bin/herdr ] && ! runuser -u user -- herdr status server | grep -qx 'status: running'; then
    setsid runuser -u user -- env -i HOME=/home/user USER=user LOGNAME=user SHELL=/bin/bash LANG=C.UTF-8 \
        PATH=/home/user/.local/bin:/usr/local/bin:/usr/bin:/bin herdr server >/dev/null 2>&1 </dev/null &
fi
for _ in $(seq 50); do
    (exec 3<>/dev/tcp/127.0.0.1/22 4<>/dev/tcp/127.0.0.1/"$POLLI_SSH_PORT") 2>/dev/null && exit 0
    sleep 0.1
done
echo "sshd or websocat did not start" >&2
exit 1
