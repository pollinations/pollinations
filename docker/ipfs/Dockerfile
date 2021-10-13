FROM ipfs/go-ipfs:latest
RUN ipfs init
#RUN ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://ipfs-node.zencraft.studio:5001", "http://localhost:3000", "http://127.0.0.1:5001", "https://webui.ipfs.io"]'
#RUN ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST"]'
RUN sysctl -w net.core.rmem_max=2500000
CMD ipfs daemon
ENTRYPOINT bash