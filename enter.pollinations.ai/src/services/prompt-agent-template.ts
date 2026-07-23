/// <reference types="vite/client" />

import promptAgentWorkerSource from "./dist/prompt-agent-worker.js?raw";

// deployCommunityWorker accepts source text, so the platform deploys this
// pre-bundled worker without resolving npm packages at request time.
export const PROMPT_AGENT_TEMPLATE_SOURCE = promptAgentWorkerSource;
