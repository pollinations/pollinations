# What E2B's template builder adds to a base image before the template's own
# steps run, so ../e2b/e2b.Dockerfile builds outside E2B too: provision.sh's
# Debian packages and shell setup, and the `user` its USER step creates.
# Copied from e2b-dev/infra at envd 0.10.1 (packages/orchestrator/pkg/template/
# build/phases/base/provision.sh and phases/finalize/configure.sh), less chrony
# and the sysctls, which a container can't use, and the sshd config that
# accepts logins without a password.
# build.mjs passes BASE from e2b.Dockerfile's FROM line, and egress-ca.crt:
# Azure sends a box's HTTPS through a proxy whose CA only the box itself trusts,
# not the builds in it. The Dockerfile here removes it again.
ARG BASE
FROM ${BASE}
USER root
COPY egress-ca.crt /usr/local/share/ca-certificates/
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/egress-ca.crt
RUN apt-get -q update \
    && DEBIAN_FRONTEND=noninteractive apt-get -qq install -y --no-install-recommends \
        systemd systemd-sysv openssh-server sudo socat curl ca-certificates fuse3 \
        iptables git nfs-common less nftables iputils-ping jq iproute2 \
    && rm -rf /var/lib/apt/lists/* \
    && echo "export SHELL='/bin/bash'" > /etc/profile.d/shell.sh \
    && echo "export PS1='\w \$ '" > /etc/profile.d/prompt.sh \
    && echo "export PS1='\w \$ '" >> /etc/profile \
    && echo "export PS1='\w \$ '" >> /root/.bashrc \
    && echo "if [ -f ~/.bashrc ]; then source ~/.bashrc; fi; if [ -f ~/.profile ]; then source ~/.profile; fi" >> /etc/profile \
    && useradd -m -s /bin/bash user \
    && usermod -aG sudo user \
    && passwd -d user \
    && echo "user ALL=(ALL:ALL) NOPASSWD: ALL" >> /etc/sudoers
