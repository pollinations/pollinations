import { Container } from "cloudflare:container";

/**
 * ImageServiceContainer — Cloudflare Container wrapping the existing
 * image.pollinations.ai Docker image. Runs the Node.js service on port 16384
 * and receives requests via service binding from the enter Worker.
 */
export class ImageServiceContainer extends Container {
	instanceType = "standard-2" as const;
	sleepAfter = 300;
	maxInstances = 1;

	override get containerConfig(): ContainerConfig {
		return {
			image: "./Dockerfile",
			exposedPorts: [16384],
			envVars: this.getEnvVars(),
		};
	}

	private getEnvVars(): Record<string, string> {
		const env = this.env as Record<string, unknown>;
		const vars: Record<string, string> = {};

		const envKeys = [
			"PORT",
			"PLN_ENTER_TOKEN",
			"PLN_FEED_PASSWORD",
			"GA_MEASUREMENT_ID",
			"GA_API_SECRET",
			"CLOUDFLARE_ACCOUNT_ID",
			"CLOUDFLARE_API_TOKEN",
			"BAD_DOMAINS",
			"AZURE_PF_GPTIMAGE_ENDPOINT",
			"AZURE_PF_GPTIMAGE_API_KEY",
			"AZURE_MYCELI_GPTIMAGE_LARGE_ENDPOINT",
			"AZURE_MYCELI_GPTIMAGE_LARGE_API_KEY",
			"AZURE_MYCELI_FLUX_KONTEXT_ENDPOINT",
			"AZURE_MYCELI_FLUX_KONTEXT_API_KEY",
			"AZURE_CONTENT_SAFETY_ENDPOINT",
			"AZURE_CONTENT_SAFETY_API_KEY",
			"SEEDREAM_API_KEY",
			"AIRFORCE_API_KEY",
			"GOOGLE_PRIVATE_KEY",
			"GOOGLE_PRIVATE_KEY_ID",
			"GOOGLE_CLIENT_EMAIL",
			"GOOGLE_PROJECT_ID",
		];

		for (const key of envKeys) {
			const value = env[key];
			if (typeof value === "string" && value.length > 0) {
				vars[key] = value;
			}
		}

		if (!vars.PORT) {
			vars.PORT = "16384";
		}

		return vars;
	}
}

interface Env {
	IMAGE_SERVICE: DurableObjectNamespace<ImageServiceContainer>;
}

interface ContainerConfig {
	image: string;
	exposedPorts: number[];
	envVars: Record<string, string>;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const id = env.IMAGE_SERVICE.idFromName("image-service");
		const stub = env.IMAGE_SERVICE.get(id);
		return stub.fetch(request);
	},
};
