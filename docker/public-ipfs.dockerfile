FROM ipfs/go-ipfs:v0.12.1
RUN ipfs init -p server
RUN ipfs config HTTPHeaders.Access-Control-Allow-Origin '["*"]'
RUN ipfs config HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
ENTRYPOINT ipfs daemon --enable-namesys-pubsub --enable-gc --enable-pubsub-experiment