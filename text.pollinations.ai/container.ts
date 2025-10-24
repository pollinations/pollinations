import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

const { CONTAINER, ...containerEnv } = env;

const envVarNames = [
    "AZURE_OPENAI_NANO_ENDPOINT",
    "AZURE_OPENAI_NANO_API_KEY",
    "AZURE_OPENAI_NANO_5_ENDPOINT",
    "AZURE_OPENAI_NANO_5_API_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_GPT_5_API_KEY",
    "AZURE_OPENAI_GPT_5_ENDPOINT",
    "AZURE_OPENAI_41_ENDPOINT",
    "AZURE_OPENAI_41_API_KEY",
    "AZURE_OPENAI_AUDIO_ENDPOINT",
    "AZURE_OPENAI_AUDIO_API_KEY",
    "AZURE_OPENAI_ROBLOX_ENDPOINT_1",
    "AZURE_OPENAI_ROBLOX_API_KEY_1",
    "AZURE_OPENAI_ROBLOX_ENDPOINT_2",
    "AZURE_OPENAI_ROBLOX_API_KEY_2",
    "AZURE_OPENAI_ROBLOX_ENDPOINT_3",
    "AZURE_OPENAI_ROBLOX_API_KEY_3",
    "AZURE_OPENAI_ROBLOX_ENDPOINT_4",
    "AZURE_OPENAI_ROBLOX_API_KEY_4",
    "AZURE_OPENAI_MINI_ENDPOINT_1",
    "AZURE_OPENAI_MINI_API_KEY_1",
    "AZURE_OPENAI_MINI_ENDPOINT_2",
    "AZURE_OPENAI_MINI_API_KEY_2",
    "AZURE_O1MINI_ENDPOINT",
    "AZURE_O1MINI_API_KEY",
    "AZURE_O4MINI_ENDPOINT",
    "AZURE_O4MINI_API_KEY",
    "AZURE_DEEPSEEK_V3_ENDPOINT",
    "AZURE_DEEPSEEK_V3_API_KEY",
    "AZURE_DEEPSEEK_REASONING_ENDPOINT",
    "AZURE_DEEPSEEK_REASONING_API_KEY",
    "AZURE_MYCELI_DEEPSEEK_R1_ENDPOINT",
    "AZURE_MYCELI_DEEPSEEK_R1_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "AZURE_LLAMA_ENDPOINT",
    "AZURE_LLAMA_API_KEY",
    "OPENAI_PHI4_ENDPOINT",
    "OPENAI_PHI4_API_KEY",
    "OPENAI_PHI4_MINI_ENDPOINT",
    "OPENAI_PHI4_MINI_API_KEY",
    "AZURE_GENERAL_ENDPOINT",
    "AZURE_GENERAL_API_KEY",
    "AZURE_OPENAI_AUDIO_LARGE_ENDPOINT",
    "AZURE_OPENAI_AUDIO_LARGE_API_KEY",
    "AZURE_MYCELI_GPT5CHAT_ENDPOINT",
    "AZURE_MYCELI_GPT5CHAT_API_KEY",
    "AZURE_MYCELI_GPT41MINI_ENDPOINT",
    "AZURE_MYCELI_GPT41MINI_API_KEY",
    "AZURE_MYCELI_GPT5NANO_ENDPOINT",
    "AZURE_MYCELI_GPT5NANO_API_KEY",
    "AZURE_MYCELI_GPT5MINI_ENDPOINT",
    "AZURE_MYCELI_GPT5MINI_API_KEY",
    "BING_API_KEY",
    "BING_API_KEY_2",
    "HUGGINGFACE_TOKEN",
    "GA_MEASUREMENT_ID",
    "GA_API_SECRET",
    "FEED_PASSWORD",
    "POLLINATIONS_AUTH_API_KEY",
    "POLLINATIONS_API_KEY",
    "SCALEWAY_API_KEY",
    "SCALEWAY_BASE_URL",
    "SCALEWAY_MISTRAL_API_KEY",
    "SCALEWAY_MISTRAL_BASE_URL",
    "SCALEWAY_PIXTRAL_BASE_URL",
    "SCALEWAY_PIXTRAL_API_KEY",
    "SCALEWAY_AI_PROJECT_ID",
    "AWS_BEARER_TOKEN_BEDROCK",
    "AWS_BEARER_TOKEN_BEDROCK_FARGATE",
    "IOINTELLIGENCE_API_KEY",
    "ELIXPOSEARCH_ENDPOINT",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_AUTH_TOKEN",
    "OPENROUTER_API_KEY",
    "VAIBHAV_OPENAI_API_KEY",
    "API_NAVY_ENDPOINT",
    "APINAVY_API_KEY",
    "NEBIUS_API_KEY",
    "PORTKEY_API_KEY",
    "PORTKEY_GATEWAY_URL",
    "TINYBIRD_API_URL",
    "TINYBIRD_API_KEY",
    "CHATWITHMONO_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GCLOUD_PROJECT_ID",
    "USER_MODEL_MAPPING",
];

const envVars = Object.fromEntries(
    Object.entries(containerEnv).filter(([key, _]) =>
        envVarNames.includes(key),
    ),
);

export class TextServiceContainer extends Container {
    defaultPort = 8080;
    sleepAfter = "10m";
    envVars = envVars;

    override onStart(): void {
        console.log("Container started!");
    }

    override onStop(): void {
        console.log("Container stopped!");
    }

    override onError(error: unknown): any {
        console.error("Container error:", error);
        throw error;
    }
}

export default {
    async fetch(request: Request, env: CloudflareBindings) {
        try {
            const container = env.CONTAINER.getByName("text-service-singleton");

            const url = new URL(request.url);

            if (url.pathname === "/admin/restart") {
                const { CONTAINER, ...envVars } = env;
                console.log(envVars);

                let state = await container.getState();
                if (["healthy", "running"].includes(state.status)) {
                    console.log("Stopping container...");
                    await container.stop("SIGTERM");
                }

                console.log("Restarting container...");
                await container.startAndWaitForPorts({
                    startOptions: {
                        envVars,
                    },
                });
                state = await container.getState();
                console.log("Container restarted:", state);
                return new Response(
                    JSON.stringify({
                        success: true,
                    }),
                );
            }

            return container.fetch(request);
        } catch (error) {
            console.log("Container fetch error:", error);
            return new Response(JSON.stringify({ error: error.message }));
        }
    },
};
