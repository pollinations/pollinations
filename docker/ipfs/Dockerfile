FROM ubuntu:focal
# IPFS INSTALLATION
RUN apt update && apt upgrade && apt install -y wget
RUN wget https://dist.ipfs.io/go-ipfs/v0.10.0/go-ipfs_v0.10.0_linux-amd64.tar.gz
RUN tar -xvzf go-ipfs_v0.10.0_linux-amd64.tar.gz
WORKDIR go-ipfs
RUN ./install.sh
# TINI INSTALLATION
ENV TINI_VERSION v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini
ENTRYPOINT ["/tini", "--", "ipfs"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ipfs dag stat /ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn || exit 1

# Execute the daemon subcommand by default
CMD ["daemon", "--init-profile=server","--migrate=true", "--enable-namesys-pubsub", "--enable-pubsub-experiment","--enable-gc", "--agent-version-suffix=docker"]