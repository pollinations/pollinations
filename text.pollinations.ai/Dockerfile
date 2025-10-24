# Dockerfile for text.pollinations.ai
#
# When building, make sure to set the build context to the root
# of the monorepo, like this: `docker build -f Dockerfile ..`

# Build
FROM node:22-slim AS builder

WORKDIR /workspace

COPY shared/package*.json ./shared/
COPY text.pollinations.ai/package*.json ./text.pollinations.ai/

WORKDIR /workspace/shared
RUN npm clean-install --omit=dev

WORKDIR /workspace/text.pollinations.ai
RUN npm clean-install --omit=dev

# Deployment
FROM node:22-slim

WORKDIR /workspace

COPY shared ./shared
COPY --from=builder /workspace/shared/node_modules ./shared/node_modules

COPY text.pollinations.ai/ ./text.pollinations.ai
COPY --from=builder /workspace/text.pollinations.ai/node_modules ./text.pollinations.ai/node_modules

ENV PORT=8080
EXPOSE ${PORT}

WORKDIR /workspace/text.pollinations.ai
CMD ["npm", "start"]
