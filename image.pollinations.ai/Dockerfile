# Dockerfile for image.pollinations.ai
#
# When building, make sure to set the build context to the root
# of the monorepo, like this: `docker build -f Dockerfile ..`

# Build
FROM node:22-slim AS builder

WORKDIR /workspace

# Add native build dependencies
RUN apt update && \
    apt install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY shared/package*.json ./shared/
COPY image.pollinations.ai/package*.json ./app/

WORKDIR /workspace/shared
RUN npm clean-install --omit=dev

WORKDIR /workspace/app
RUN npm clean-install --omit=dev

# Deployment
FROM node:22-slim

WORKDIR /workspace

# Install runtime dependencies
RUN apt update && \
    apt install -y imagemagick && \
    rm -rf /var/lib/apt/lists/*

COPY shared ./shared
COPY --from=builder /workspace/shared/node_modules ./shared/node_modules

COPY image.pollinations.ai/package*.json ./app/
COPY image.pollinations.ai/tsconfig.json ./app/
COPY image.pollinations.ai/src           ./app/src
COPY image.pollinations.ai/observability ./app/observability
COPY image.pollinations.ai/auth          ./app/auth
COPY --from=builder /workspace/app/node_modules ./app/node_modules

EXPOSE 16384

WORKDIR /workspace/app
CMD ["npm", "start"]
