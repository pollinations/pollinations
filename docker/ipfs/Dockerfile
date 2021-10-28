FROM ubuntu:focal
# IPFS INSTALLATION
RUN apt update && apt upgrade && apt install -y wget
RUN wget https://dist.ipfs.io/go-ipfs/v0.10.0/go-ipfs_v0.10.0_linux-amd64.tar.gz
RUN tar -xvzf go-ipfs_v0.10.0_linux-amd64.tar.gz
WORKDIR go-ipfs
RUN ./install.sh
# TINI INSTALLATION
RUN apt install -y tini
ENTRYPOINT ["/usr/bin/tini", "--"]
#HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
#  CMD ipfs dag stat /ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn || exit 1
# Swarm TCP; should be exposed to the public
EXPOSE 4001
# Swarm UDP; should be exposed to the public
EXPOSE 4001/udp
# Daemon API; must not be exposed publicly but to client services under you control
EXPOSE 5001
# Web Gateway; can be exposed publicly with a proxy, e.g. as https://ipfs.example.org
EXPOSE 8080
# Execute the daemon subcommand by default
CMD ["ipfs", "daemon", "--init-profile=server","--migrate=true", "--enable-namesys-pubsub", "--enable-pubsub-experiment","--enable-gc", "--agent-version-suffix=docker"]
