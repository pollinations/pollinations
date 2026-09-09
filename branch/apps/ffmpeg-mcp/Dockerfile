FROM alpine:3.24

RUN apk add --no-cache ffmpeg coreutils ca-certificates \
    && adduser -D -u 10001 ffmpeg \
    && mkdir -p /work \
    && chown ffmpeg:ffmpeg /work

USER ffmpeg
WORKDIR /work
CMD ["sleep", "infinity"]
