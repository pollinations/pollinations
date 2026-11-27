import {
    type CodeAgentOutboundContext,
    handleCodeAgentOutbound,
} from "../../enter.pollinations.ai/src/services/code-agent-outbound.ts";

export default {
    fetch(
        request: Request,
        env: { CODE_AGENT_CONTEXT: CodeAgentOutboundContext },
    ) {
        return handleCodeAgentOutbound(request, env.CODE_AGENT_CONTEXT);
    },
};
