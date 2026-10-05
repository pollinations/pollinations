#!/bin/bash
# Runs as root in an E2B sandbox on every `ssh <id>.polli`; each step is
# idempotent. E2B sandboxes run systemd, which runs sshd once installed. E2B's
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
key_only() {
    test "$(sshd -T | grep -cxE '(permitemptypasswords|passwordauthentication|kbdinteractiveauthentication|permitrootlogin) no')" = 4
}
if key_only; then
    systemctl start ssh
else
    printf 'PermitEmptyPasswords no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n\n' |
        cat - /etc/ssh/sshd_config > /tmp/sshd_config
    cat /tmp/sshd_config > /etc/ssh/sshd_config
    key_only
    systemctl restart ssh
fi
install -d -m 700 -o user -g user /home/user/.ssh
touch /home/user/.ssh/authorized_keys
grep -qxF "$POLLI_SSH_KEY" /home/user/.ssh/authorized_keys || printf '%s\n' "$POLLI_SSH_KEY" >> /home/user/.ssh/authorized_keys
chown user:user /home/user/.ssh/authorized_keys
chmod 600 /home/user/.ssh/authorized_keys
if ! { [ -s /run/polli-ws.pid ] && kill -0 "$(cat /run/polli-ws.pid)" 2>/dev/null; }; then
    setsid nohup sh -c 'while :; do websocat -b -E "ws-l:0.0.0.0:$POLLI_SSH_PORT" tcp:127.0.0.1:22; sleep 1; done' >/dev/null 2>&1 </dev/null &
    echo $! > /run/polli-ws.pid
fi
for _ in $(seq 50); do
    (exec 3<>/dev/tcp/127.0.0.1/22 4<>/dev/tcp/127.0.0.1/"$POLLI_SSH_PORT") 2>/dev/null && exit 0
    sleep 0.1
done
echo "sshd or websocat did not start" >&2
exit 1
