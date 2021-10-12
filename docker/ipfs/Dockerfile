FROM ipfs/go-ipfs:latest
RUN apt install sh
RUN ipfs init
#RUN ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://ipfs-node.zencraft.studio:5001", "http://localhost:3000", "http://127.0.0.1:5001", "https://webui.ipfs.io"]'
#RUN ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST"]'
CMD ipfs daemon