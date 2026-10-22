# The image of the Azure templates (gen's src/routes/azure-sandboxes.ts): the
# `pollinations` E2B template's image (../e2b/e2b.Dockerfile, built first as
# BASE), plus what E2B's orchestrator and systemd provide there: envd, the
# agent E2B's SDKs and `polli sandbox ssh` talk to, and polli-box, which starts
# it. build.mjs builds both on Azure and imports the result.
ARG BASE=polli-e2b

FROM golang:1.26.10-bookworm AS envd
# e2b-dev/infra at envd 0.10.1, the version gen reports (ENVD_VERSION).
ARG INFRA_COMMIT=f81220bcddeae956b82c3649e5551d61566b5d44
# Azure's egress CA, as in e2b-base.Dockerfile.
COPY egress-ca.crt /usr/local/share/ca-certificates/
RUN update-ca-certificates \
    && git clone --filter=blob:none https://github.com/e2b-dev/infra /infra \
    && git -C /infra checkout "$INFRA_COMMIT"
WORKDIR /infra/packages/envd
RUN CGO_ENABLED=0 go build -o /envd .

FROM ${BASE}
COPY --from=envd /envd /usr/local/bin/envd
COPY polli-box /usr/local/bin/polli-box
# envd runs as root and starts each process as `user` by default. Azure adds
# its egress CA to each box at boot, at this path. The rest is E2B's finalize
# step (configure.sh), which runs after the template's own.
USER root
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/adc-egress-proxy-ca.crt
RUN rm /usr/local/share/ca-certificates/egress-ca.crt \
    && update-ca-certificates --fresh \
    && chown -R user:user /home/user \
    && chmod -R 777 /usr/local \
    && mkdir -p /code \
    && chmod -R 777 /code
