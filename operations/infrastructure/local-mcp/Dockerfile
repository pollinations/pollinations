# Remote-only local-shell-mcp controller for the Local MCP pilot (runbook.txt).
# Upstream: https://github.com/fwerkor/local-shell-mcp at the commit below,
# MIT License, Copyright (c) 2026 local-shell-mcp contributors. Its LICENSE
# ships unchanged in /opt/local-shell-mcp/LICENSE.
FROM python:3.12-slim-bookworm@sha256:6a0e06f5ba0b373d051aabd3fffb9b873f27f9a2a3a14bcbe37dee6f0e3bbc70
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/opt/local-shell-mcp/src
# The codeload archive of the pinned commit, accepted only with this SHA-256.
RUN python -c "import hashlib, sys, urllib.request; data = urllib.request.urlopen(sys.argv[1], timeout=120).read(); hashlib.sha256(data).hexdigest() == sys.argv[2] or sys.exit('upstream archive checksum mismatch'); open(sys.argv[3], 'wb').write(data)" \
      https://codeload.github.com/fwerkor/local-shell-mcp/tar.gz/066abd563016bf20aee5df9e9a752b5ba8d9e396 \
      d8ce94d2833b0b7f03728b0c47e0c045da4f87252c8e0242f0b6207391d7ed86 \
      /tmp/upstream-source.tar.gz \
 && mkdir /opt/local-shell-mcp \
 && tar -xzf /tmp/upstream-source.tar.gz -C /opt/local-shell-mcp --strip-components=1 \
 && rm /tmp/upstream-source.tar.gz
# Complete hashed lock (requirements-controller.in -> .txt); Playwright and
# the other local-execution extras are deliberately not installed.
COPY requirements-controller.txt /tmp/requirements-controller.txt
RUN python -m pip install --no-cache-dir --only-binary=:all: --require-hashes --no-deps \
      -r /tmp/requirements-controller.txt \
 && rm /tmp/requirements-controller.txt \
 && useradd --uid 10001 --create-home --shell /usr/sbin/nologin controller \
 && mkdir -p /state/workspace \
 && chown -R controller:controller /state
LABEL org.opencontainers.image.source="https://github.com/fwerkor/local-shell-mcp" \
      org.opencontainers.image.revision="066abd563016bf20aee5df9e9a752b5ba8d9e396" \
      org.opencontainers.image.licenses="MIT"
USER 10001:10001
WORKDIR /state
HEALTHCHECK --interval=20s --timeout=3s --start-period=20s --retries=3 \
 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/healthz', timeout=2)"
ENTRYPOINT ["python", "-m", "local_shell_mcp.main", "--mode", "mcp", "--remote"]
