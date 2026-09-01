FROM ghcr.io/algorithmicsuperintelligence/optillm:latest-proxy@sha256:932decfa40a5a8fd24f5d7bbd9629b8a58c52b7ad7b3b6f3d7b587212763e84d

USER root
COPY patch_optillm.py /tmp/patch_optillm.py
RUN python /tmp/patch_optillm.py && rm /tmp/patch_optillm.py
USER appuser

ENV OPTILLM_BASE_URL=https://gen.pollinations.ai/v1 \
    OPTILLM_APPROACH=none \
    OPTILLM_HOST=0.0.0.0 \
    OPTILLM_PORT=8000
