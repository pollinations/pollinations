FROM alpine:3.24

RUN apk add --no-cache python3 \
    && adduser -D -u 10001 python \
    && mkdir -p /work \
    && chown python:python /work

USER python
WORKDIR /work
CMD ["sleep", "infinity"]
