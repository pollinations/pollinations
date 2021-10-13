FROM ipfs/go-ipfs:v0.10.0
RUN ipfs init
RUN ipfs init
RUN ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://ipfs-node.zencraft.studio:5001", "http://localhost:3000", "http://127.0.0.1:5001", "https://webui.ipfs.io"]'
RUN ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST"]'
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/start_ipfs"]

# Heathcheck for the container
# QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn is the CID of empty folder
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ipfs dag stat /ipfs/QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn || exit 1

# Execute the daemon subcommand by default
CMD ["daemon", "--migrate=true", "--agent-version-suffix=docker"]