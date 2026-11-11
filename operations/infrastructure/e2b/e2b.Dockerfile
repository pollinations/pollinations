# The `pollinations` E2B template, the default for `polli sandbox create`:
# E2B's base image with polli, the coding harnesses polli connects, herdr, and
# what `ssh <id>.polli` needs, so the first ssh doesn't install it. Gen logs polli
# in inside each new sandbox; the first interactive login connects the
# harnesses (polli-harnesses.sh).
# Versions are pinned, the base image by digest: E2B reuses a cached step while
# its text stays the same, so a new release reaches the image only by bumping
# its version here. .github/workflows/deploy-e2b-templates.yml rebuilds
# `pollinations` and `pollinations-large` when a change here reaches production.
# Test a change first under another name with the E2B team key:
#   E2B_API_KEY=... npx -y @e2b/cli@2.21.2 template create pollinations-test \
#     --path operations/infrastructure/e2b --cpu-count 2 --memory-mb 2048
# on a box from `polli sandbox create pollinations-test`; then delete it with
# `npx -y @e2b/cli@2.21.2 template delete -y pollinations-test`.
FROM e2bdev/base@sha256:4a369f01a820fe5e65f53c2c5727a78899daf86f0541b721097f289559c8b73f

USER root

# sshd stays off, socket activation included, until the first
# `ssh <id>.polli`, whose bootstrap.sh allows only key logins before starting
# it: E2B's default sshd config accepts `user` without a password.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openssh-server rsync \
    && rm -rf /var/lib/apt/lists/* \
    && systemctl disable ssh \
    && systemctl mask ssh.socket

# Everyday tools the base image lacks, about 400 MB together: cron, which
# systemd starts in every sandbox; ffmpeg; git-lfs; pdftotext and friends;
# ripgrep and fd; sqlite3; tmux; editors; network and process checks. rclone
# mounts a bucket (S3, R2, GCS) as a folder, for big files that should outlive
# the sandbox; the base image's fuse3 lets `user` mount it.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        cron ffmpeg git-lfs poppler-utils rclone ripgrep fd-find tree bc zip zstd \
        p7zip-full sqlite3 tmux nano vim-tiny htop lsof strace dnsutils netcat-openbsd \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/fdfind /usr/local/bin/fd \
    && git lfs install --system \
    && printf '# Cron jobs find commands only on this PATH; keep it when replacing the crontab.\nPATH=/home/user/.local/bin:/usr/local/bin:/usr/bin:/bin\n' | crontab -u user -

# uv runs Python tools and MCP servers (`uvx`), and installs newer Pythons than
# the base image's 3.11.
RUN curl -fsSL -o /tmp/uv.tar.gz https://github.com/astral-sh/uv/releases/download/0.12.21/uv-x86_64-unknown-linux-gnu.tar.gz \
    && echo "23f02075b652bb1df64178cfae41b5caf160822e720e2663568f3f5d63bc52c0  /tmp/uv.tar.gz" | sha256sum -c \
    && tar -xzf /tmp/uv.tar.gz -C /usr/local/bin --strip-components=1 \
    && rm /tmp/uv.tar.gz

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
# its router runs as a systemd user service, and sandboxes start none.
RUN npx -y n@10.2.0 24.21.0 && rm -rf /usr/local/n \
    && npm install -g @pollinations/cli@0.1.61 @anthropic-ai/claude-code@2.1.308 \
        opencode-ai@1.19.0 openclaw@2026.10.2 \
    && npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.1.0

COPY polli-harnesses.sh /etc/profile.d/
# What to try first, shown at each interactive ssh login (Debian's pam_motd).
COPY motd /etc/motd

USER user
WORKDIR /home/user

# herdr is pinned above, so it shouldn't offer updates.
RUN mkdir -p .config/herdr && printf '[update]\nversion_check = false\n' > .config/herdr/config.toml
