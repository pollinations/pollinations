# The `pollinations` E2B template, the default for `polli sandbox create`:
# E2B's base image with polli, the coding harnesses polli connects, and what
# `ssh <id>.polli` needs, so the first ssh doesn't install it. Gen logs polli
# in inside each new sandbox; the first interactive login connects the
# harnesses (polli-harnesses.sh).
# Versions are pinned: E2B reuses a cached step while its text stays the same,
# so a new release reaches the image only by bumping its version here. Rebuild
# with the E2B team key:
#   E2B_API_KEY=... npx -y @e2b/cli@2.21.2 template create pollinations \
#     --path operations/infrastructure/e2b --cpu-count 2 --memory-mb 2048
# and its larger size, `pollinations-large`, with --cpu-count 4 --memory-mb 8192.
# Test a change first under another name, like pollinations-test, on a box from
# `polli sandbox create pollinations-test`; then delete it with
# `npx -y @e2b/cli@2.21.2 template delete -y pollinations-test`.
FROM e2bdev/base

USER root

# sshd stays off, socket activation included, until the first
# `ssh <id>.polli`, whose bootstrap.sh allows only key logins before starting
# it: E2B's default sshd config accepts `user` without a password.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openssh-server rsync \
    && rm -rf /var/lib/apt/lists/* \
    && systemctl disable ssh \
    && systemctl mask ssh.socket

# Same release and checksum as bootstrap.sh.
RUN curl -fsSL -o /usr/local/bin/websocat https://github.com/vi/websocat/releases/download/v1.14.1/websocat.x86_64-unknown-linux-musl \
    && echo "66f8dd3a0394761556339117f8bb5123bddefd44e087af2a72ec22b0bd08d514  /usr/local/bin/websocat" | sha256sum -c \
    && chmod 755 /usr/local/bin/websocat

# polli needs Node 20.12 or newer; the base image has 20.9. Then the harnesses
# `polli harness` connects, from the installers its hints name. Not Codex:
# its router runs as a systemd user service, and sandboxes have no systemd.
RUN npx -y n@10.2.0 24.21.0 && rm -rf /usr/local/n \
    && npm install -g @pollinations/cli@0.1.42 @anthropic-ai/claude-code@2.1.296 \
        opencode-ai@1.19.0 openclaw@2026.10.2 \
    && npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.1.0

COPY polli-harnesses.sh /etc/profile.d/

USER user
WORKDIR /home/user

# Hermes v0.21.7: its installer and checkout, both at that release's commit.
RUN curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/71d34bad1045610252eda02ee79549436896e784/scripts/install.sh \
    | bash -s -- --non-interactive --skip-browser --skip-computer-use \
        --commit 71d34bad1045610252eda02ee79549436896e784
