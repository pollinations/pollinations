# The `pollinations` E2B template, the default for `polli sandbox create`:
# E2B's base image with polli, the coding harnesses polli connects, herdr, and
# what `ssh <id>.polli` needs, so the first ssh doesn't install it. Gen logs polli
# in inside each new sandbox; the first interactive login connects the
# harnesses (polli-harnesses.sh). Rebuild with the E2B team key:
#   E2B_API_KEY=... npx -y @e2b/cli@2.20.0 template create pollinations \
#     --path operations/infrastructure/e2b --cpu-count 2 --memory-mb 2048
# and its larger size, `pollinations-large`, with --cpu-count 4 --memory-mb 8192.
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

# herdr keeps agents running in its panes between ssh sessions and lists them
# with their state; bootstrap.sh starts its server. On PATH, so `herdr machine
# add <id>.polli` finds it instead of installing its own.
RUN curl -fsSL -o /usr/local/bin/herdr https://github.com/herdrdev/herdr/releases/download/v0.9.3/herdr-linux-x86_64 \
    && echo "18a8dc65f1c2fa485884344356dea1cfd911c6f06cf46fa78e193f4087f4dba7  /usr/local/bin/herdr" | sha256sum -c \
    && chmod 755 /usr/local/bin/herdr

# polli needs Node 20.12 or newer; the base image has 20.9. Then the harnesses
# `polli harness` connects, from the installers its hints name. Not Codex:
# its router runs as a systemd user service, and sandboxes have no systemd.
RUN npx -y n 24 && rm -rf /usr/local/n \
    && npm install -g @pollinations/cli @anthropic-ai/claude-code \
        opencode-ai openclaw \
    && npm install -g --ignore-scripts @earendil-works/pi-coding-agent

COPY polli-harnesses.sh /etc/profile.d/

USER user
WORKDIR /home/user

# herdr is pinned above, so it shouldn't offer updates.
RUN mkdir -p .config/herdr && printf '[update]\nversion_check = false\n' > .config/herdr/config.toml

RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
    | bash -s -- --non-interactive --skip-browser --skip-computer-use
