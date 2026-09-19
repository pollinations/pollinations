# Smart Health-Aware Model Router

An intelligent, self-healing code agent for Pollinations that routes prompts by cognitive complexity (task difficulty) and continuously inspects live cluster health to evade degraded models.

- **Repository:** [https://github.com/HellowHoney/pollinations-smart-router](https://github.com/HellowHoney/pollinations-smart-router)
- **Callable Model:** `HellowHoney/pollinations-smart-router`

## Routing Logic

1. **Complexity Classification:** Incoming requests are inspected by a high-speed classifier (`openai/gpt-5.4-nano`) into three distinct tiers:
   - **FAST:** Simple chit-chat, greetings, short translations, and trivial formatting (`inception/mercury-2.5-preview`).
   - **BALANCED:** General coding, analysis, multi-turn discussions, and everyday requests (`google/gemini-3.8-flash`).
   - **DEEP:** Complex architecture, deep algorithmic logic, multi-step math, and difficult refactoring (`x-ai/grok-4.3`).
2. **Health-Aware Fallback (`/models/status?minutes=30`):** Prior to dispatch, the agent inspects rolling 30-minute error rates. If the primary model shows elevated 5xx error spikes (>15%), it dynamically reroutes to an active fallback within the tier.
3. **Transparent Verification Headers:** Every response exposes `x-router-tier`, `x-router-selected-model`, and `x-router-reason`.

## Test Runs & Verification

### Test 1: Trivial Chit-Chat (FAST)
- **Prompt:** `"Olá, me dê 3 palavras gregas aleatórias e seu significado."`
- **Result:** Routed to `inception/mercury-2.5-preview`
- **Header:** `x-router-tier: FAST` | `x-router-reason: Classified as FAST. Primary model is healthy.`

### Test 2: Standard Function Implementation (BALANCED)
- **Prompt:** `"Escreva uma função TypeScript com debounce e cancelamento em React 19."`
- **Result:** Routed to `google/gemini-3.8-flash`
- **Header:** `x-router-tier: BALANCED` | `x-router-reason: Classified as BALANCED. Primary model is healthy.`

### Test 3: Complex Architectural Design (DEEP)
- **Prompt:** `"Projete a arquitetura de concorrência e consistência de um banco de dados distribuído para um MMO com 100k jogadores simultâneos."`
- **Result:** Routed to `x-ai/grok-4.3`
- **Header:** `x-router-tier: DEEP` | `x-router-reason: Classified as DEEP. Primary model is healthy.`
