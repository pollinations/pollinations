FROM ipfs/go-ipfs:latest
RUN ipfs init
RUN apt update
RUN apt install sh
#RUN ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://ipfs-node.zencraft.studio:5001", "http://localhost:3000", "http://127.0.0.1:5001", "https://webui.ipfs.io"]'
#RUN ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST"]'
ENV TINI_SUBREAPER 1
CMD ipfs daemon