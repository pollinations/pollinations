FROM node:24-bookworm

ENV CI=true \
    WRANGLER_SEND_METRICS=false \
    TEST_VCR_MODE=replay-only

# The scanner supplies a fresh public checkout, never a maintainer's workspace.
COPY . /src
WORKDIR /src

# Root workspaces, plus the packages that keep their own lockfiles.
RUN npm ci --no-audit --no-fund \
    && npm ci --prefix packages/mcp --no-audit --no-fund

# Compile both Workers and the dashboard without deploying or loading secrets.
RUN npm run build:staging --workspace pollinations-enter \
    && npm run build:staging --workspace pollinations-gen

# Smoke-test the offline suites so a broken image shows in the build log.
RUN (npm test --workspace pollinations-enter -- test/oauth-code.test.ts test/account-key.test.ts test/balance-check.test.ts \
    && npm test --workspace pollinations-gen -- test/billing-deduction.test.ts test/generation-deduplication.test.ts test/media-cache.test.ts \
    && npm test --workspace media.pollinations.ai) \
    || echo "WARNING: offline tests failed"
