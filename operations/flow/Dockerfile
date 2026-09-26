FROM mcr.microsoft.com/playwright:v1.57.0-noble@sha256:3bed4b1a12f2338642f3d8cba28e291deef3c66bd4a964bbeb3e57bbff511dbd

WORKDIR /workspace
COPY . .
RUN npm ci --no-audit --no-fund && npm run build --workspace=pollinations-flow

ARG FLOW_REVISION
ARG FLOW_MAIN_REVISION
ARG FLOW_DIRTY
ENV FLOW_REVISION=$FLOW_REVISION FLOW_MAIN_REVISION=$FLOW_MAIN_REVISION FLOW_DIRTY=$FLOW_DIRTY

CMD ["npm", "run", "start", "--workspace=pollinations-flow"]
