/**
 * Permite que campos específicos do Gemini (como thought_signature) passem pelo sanitizador.
 */

function allowThoughtFields(obj) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(allowThoughtFields);

    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        // Se o campo começa com thought_ ou é tool_call_id, mantemos ele intacto
        if (k.startsWith("thought_") || k === "thought_signature") {
            result[k] = v;
        } else {
            result[k] = typeof v === "object" ? allowThoughtFields(v) : v;
        }
    }
    return result;
}

export function passthroughToolSchemas() {
    return (messages, options) => {
        // Preservamos a assinatura nas mensagens se elas existirem
        const newMessages = messages.map((msg) => {
            if (msg.thought_signature) {
                return { ...msg, thought_signature: msg.thought_signature };
            }
            return msg;
        });

        return {
            messages: newMessages,
            options: {
                ...options,
                // Aplicamos também nos schemas de ferramentas se necessário
                tools: options.tools?.map((t) =>
                    t.type === "function" && t.function?.parameters
                        ? {
                              ...t,
                              function: {
                                  ...t.function,
                                  parameters: allowThoughtFields(
                                      t.function.parameters,
                                  ),
                              },
                          }
                        : t,
                ),
            },
        };
    };
}
