# Dockerfile for text.pollinations.ai
#
# When building, make sure to set the build context to the root
# of the monorepo, like this: `docker build -f Dockerfile ..`

# Build
FROM node:22-slim AS builder

WORKDIR /workspace

COPY shared/package*.json ./shared/
COPY text.pollinations.ai/package*.json ./app/

WORKDIR /workspace/shared
RUN npm clean-install --omit=dev

WORKDIR /workspace/app
RUN npm clean-install --omit=dev

# Deployment
FROM node:22-slim

WORKDIR /workspace

COPY shared ./shared
COPY --from=builder /workspace/shared/node_modules ./shared/node_modules

COPY text.pollinations.ai/ ./app
COPY --from=builder /workspace/app/node_modules ./app/node_modules

EXPOSE 16385

WORKDIR /workspace/app
CMD ["npm", "start"]
