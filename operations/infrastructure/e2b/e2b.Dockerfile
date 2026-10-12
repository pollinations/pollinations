# The `pollinations` E2B template, the default for `polli sandbox create`:
# E2B's base image with polli, the coding harnesses polli connects, and what
# `ssh <id>.polli` needs, so the first ssh doesn't install it. Gen logs polli
# in inside each new sandbox; the first interactive login connects the
# harnesses (polli-harnesses.sh). Rebuild both sizes with the E2B team key
# through build.mjs, which says why not with the e2b CLI:
#   npm ci --prefix operations/infrastructure/e2b
#   E2B_API_KEY=... node operations/infrastructure/e2b/build.mjs pollinations
#   E2B_API_KEY=... node operations/infrastructure/e2b/build.mjs pollinations-large
# To test a change before merging, build it under another name
# (`build.mjs pollinations pollinations-test`), check a box from it
# (`polli sandbox create pollinations-test`), then delete it
# (`npx -y @e2b/cli@2.21.2 template delete -y pollinations-test`).
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
RUN npx -y n 24 && rm -rf /usr/local/n \
    && npm install -g @pollinations/cli @anthropic-ai/claude-code \
        opencode-ai openclaw \
    && npm install -g --ignore-scripts @earendil-works/pi-coding-agent

COPY polli-harnesses.sh /etc/profile.d/

USER user
WORKDIR /home/user

RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
    | bash -s -- --non-interactive --skip-browser --skip-computer-use
