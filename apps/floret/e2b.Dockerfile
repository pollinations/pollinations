# The `floret` E2B template, one sandbox per Floret run (e2b-agent.js): E2B's
# base image (Debian 12, Python 3.11, Node 20) with ffmpeg and Floret's Python
# dependencies, so a run only writes Floret's source and starts it.
# .github/workflows/deploy-e2b-templates.yml rebuilds it when this file or
# pyproject.toml reaches production. Test a change first under another name
# with the E2B team key:
#   E2B_API_KEY=... npx -y @e2b/cli@2.21.2 template create floret-test \
#     --path apps/floret --dockerfile e2b.Dockerfile --cpu-count 2 --memory-mb 2048
# then delete it with `npx -y @e2b/cli@2.21.2 template delete -y floret-test`.
FROM e2bdev/base@sha256:4a369f01a820fe5e65f53c2c5727a78899daf86f0541b721097f289559c8b73f

USER root

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Dependencies only: each run brings Floret's source, so code changes need no rebuild.
COPY pyproject.toml /opt/floret/pyproject.toml
RUN python3 -c "import tomllib; print('\n'.join(tomllib.load(open('/opt/floret/pyproject.toml', 'rb'))['project']['dependencies']))" > /opt/floret/requirements.txt \
    && pip install --no-cache-dir -r /opt/floret/requirements.txt

USER user
WORKDIR /home/user
