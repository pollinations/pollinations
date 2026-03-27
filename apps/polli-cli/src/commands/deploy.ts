import { Command } from "commander";
import ora from "ora";
import { requireKey } from "../lib/api.js";
import {
	getOutputMode,
	printError,
	printInfo,
	printResult,
} from "../lib/output.js";

const CF_API = "https://api.cloudflare.com/client/v4";

interface PagesProject {
	name: string;
	subdomain: string;
	domains: string[];
	latest_deployment?: {
		id: string;
		url: string;
		environment: string;
		created_on: string;
		latest_stage?: { name: string; status: string };
	};
}

interface CfResponse<T> {
	success: boolean;
	result: T;
	errors?: Array<{ code: number; message: string }>;
}

const cfApi = async <T>(
	path: string,
	accountId: string,
	token: string,
): Promise<T> => {
	const res = await fetch(`${CF_API}/accounts/${accountId}${path}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Cloudflare API ${res.status}: ${text}`);
	}

	const data = (await res.json()) as CfResponse<T>;
	if (!data.success) {
		throw new Error(
			`Cloudflare: ${data.errors?.map((e) => e.message).join(", ") ?? "unknown error"}`,
		);
	}
	return data.result;
};

const deploy = new Command("deploy")
	.description("Deploy an app to {app}.pollinations.ai")
	.argument("<app>", "App name (must be in apps.json)")
	.action(async (app) => {
		requireKey();

		const cfToken = process.env.CLOUDFLARE_API_TOKEN;
		const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;

		if (!cfToken || !cfAccount) {
			printError(
				"Cloudflare credentials required: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID",
			);
			printInfo(
				"For most users, deployment is automatic when your app PR merges to main.",
			);
			printInfo(
				"Manual deploy is for maintainers only.",
			);
			process.exit(1);
		}

		const isHuman = getOutputMode() === "human";
		const spinner = isHuman
			? ora(`Deploying ${app}...`).start()
			: null;

		try {
			// Check if project exists
			const project = await cfApi<PagesProject>(
				`/pages/projects/apps-${app}`,
				cfAccount,
				cfToken,
			);

			spinner?.succeed(`Project apps-${app} exists`);
			printResult({
				project: project.name,
				url: `https://${app}.pollinations.ai`,
				status:
					project.latest_deployment?.latest_stage?.status ?? "unknown",
				last_deploy: project.latest_deployment?.created_on ?? "never",
			});
		} catch (err) {
			spinner?.fail("Deploy failed");
			printError(err instanceof Error ? err.message : "unknown");
			printInfo(
				"Tip: most apps deploy automatically when merged to main.",
			);
			process.exit(1);
		}
	});

const deployStatus = new Command("status")
	.description("Check deployment status")
	.argument("<app>", "App name")
	.action(async (app) => {
		const cfToken = process.env.CLOUDFLARE_API_TOKEN;
		const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;

		if (!cfToken || !cfAccount) {
			printError(
				"Cloudflare credentials required: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID",
			);
			process.exit(1);
		}

		const isHuman = getOutputMode() === "human";
		const spinner = isHuman ? ora("Checking status...").start() : null;

		try {
			const project = await cfApi<PagesProject>(
				`/pages/projects/apps-${app}`,
				cfAccount,
				cfToken,
			);

			spinner?.stop();

			const d = project.latest_deployment;
			printResult({
				project: project.name,
				url: `https://${app}.pollinations.ai`,
				deployment_url: d?.url ?? "none",
				environment: d?.environment ?? "none",
				status: d?.latest_stage?.status ?? "unknown",
				deployed_at: d?.created_on ?? "never",
			});
		} catch (err) {
			spinner?.fail("Failed");
			printError(err instanceof Error ? err.message : "unknown");
			process.exit(1);
		}
	});

export const deployCommand = new Command("deploy")
	.description("Deploy apps to pollinations.ai hosting")
	.addCommand(deploy.name("run"))
	.addCommand(deployStatus);
