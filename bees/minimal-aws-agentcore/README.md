# Minimal AWS AgentCore bee

Smallest useful reference for Amazon Bedrock AgentCore Runtime.

Use this when the bee should be:

- deployable as an AgentCore HTTP runtime;
- compatible with AgentCore sessions;
- hosted on AWS credits;
- packaged as an ARM64 container.

## AgentCore HTTP contract

- Listen on `0.0.0.0:8080`.
- `GET /ping` returns health.
- `POST /invocations` accepts a prompt payload.

This example intentionally does not include AWS SDK calls. AgentCore owns the
runtime envelope; the container only needs to satisfy the HTTP contract.
