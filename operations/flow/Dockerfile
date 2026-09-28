FROM mcr.microsoft.com/playwright:v1.57.0-noble@sha256:3bed4b1a12f2338642f3d8cba28e291deef3c66bd4a964bbeb3e57bbff511dbd

WORKDIR /workspace
# Builds from the repository root use its .dockerignore.
COPY package.json package-lock.json BRING_YOUR_OWN_MODEL.md BRING_YOUR_OWN_POLLEN.md BUILD_YOUR_OWN_AGENT.md CODING_HARNESSES.md ./
COPY shared ./shared
COPY enter.pollinations.ai ./enter.pollinations.ai
COPY gen.pollinations.ai ./gen.pollinations.ai
COPY packages/auth ./packages/auth
COPY packages/sdk ./packages/sdk
COPY packages/ui ./packages/ui
COPY packages/polli-cli/README.md ./packages/polli-cli/README.md
# npm resolves these workspaces; Flow does not execute their application code.
COPY apps/react/package.json ./apps/react/package.json
COPY operations/economics/web/package.json ./operations/economics/web/package.json
COPY operations/flow ./operations/flow
RUN npm ci --no-audit --no-fund && npm ci --prefix operations/flow --no-audit --no-fund && npm exec --prefix operations/flow -- playwright install chromium && npm run build --prefix operations/flow

ARG FLOW_REVISION
ARG FLOW_MAIN_REVISION
ARG FLOW_DIRTY
ENV FLOW_REVISION=$FLOW_REVISION FLOW_MAIN_REVISION=$FLOW_MAIN_REVISION FLOW_DIRTY=$FLOW_DIRTY

CMD ["./node_modules/.bin/tsx", "--tsconfig", "operations/flow/tsconfig.flow.json", "operations/flow/serve.ts"]
