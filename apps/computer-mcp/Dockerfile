FROM ghcr.io/cloudflare/computer-computerd-linux-x64:0.3.0 AS computerd

FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl fuse3 git jq libfuse2 openssh-server \
 && rm -rf /var/lib/apt/lists/*

COPY --from=computerd /usr/local/bin/computerd /usr/local/bin/computerd
COPY sshd_config /etc/ssh/sshd_config.d/computer.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

ENV PORT=8080
ENV MOUNT_POINT=/workspace
ENV FUSE_MOUNT=auto
ENV GIT_AUTHOR_NAME="Pollinations Agent"
ENV GIT_AUTHOR_EMAIL=agent@pollinations.ai
ENV GIT_COMMITTER_NAME="Pollinations Agent"
ENV GIT_COMMITTER_EMAIL=agent@pollinations.ai

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
