/**
 * Mock enter worker for gen tests.
 * Handles /api/internal/verify and /api/internal/deduct.
 *
 * Provides three test users based on the API key:
 * - "sk_test_free"     → valid, tier balance only (free tier)
 * - "sk_test_paid"     → valid, paid balance (pack + tier)
 * - "sk_test_restricted" → valid, restricted to ["openai-fast", "flux"]
 * - "sk_test_exhausted"  → valid, zero balance
 * - anything else       → invalid
 */
export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === "/api/internal/verify" && request.method === "POST") {
			const body = await request.json();
			const auth = body.authorization;
			if (!auth) {
				return Response.json({ valid: false });
			}

			const key = auth.replace(/^Bearer /, "");

			const users = {
				sk_test_free: {
					valid: true,
					userId: "user_free",
					tier: "seed",
					apiKeyId: "key_free",
					keyType: "secret",
					keyName: "Test Free Key",
					permissions: null,
					pollenBudget: null,
					hasPositiveBalance: true,
					hasPaidBalance: false,
					balances: { tier: 1.0, crypto: 0, pack: 0 },
				},
				sk_test_paid: {
					valid: true,
					userId: "user_paid",
					tier: "seed",
					apiKeyId: "key_paid",
					keyType: "secret",
					keyName: "Test Paid Key",
					permissions: null,
					pollenBudget: null,
					hasPositiveBalance: true,
					hasPaidBalance: true,
					balances: { tier: 1.0, crypto: 0, pack: 100 },
				},
				sk_test_restricted: {
					valid: true,
					userId: "user_restricted",
					tier: "seed",
					apiKeyId: "key_restricted",
					keyType: "secret",
					keyName: "Test Restricted Key",
					permissions: { models: ["openai-fast", "flux"] },
					pollenBudget: null,
					hasPositiveBalance: true,
					hasPaidBalance: false,
					balances: { tier: 1.0, crypto: 0, pack: 0 },
				},
				sk_test_exhausted: {
					valid: true,
					userId: "user_exhausted",
					tier: "seed",
					apiKeyId: "key_exhausted",
					keyType: "secret",
					keyName: "Test Exhausted Key",
					permissions: null,
					pollenBudget: null,
					hasPositiveBalance: false,
					hasPaidBalance: false,
					balances: { tier: 0, crypto: 0, pack: 0 },
				},
			};

			const user = users[key];
			if (user) {
				return Response.json(user);
			}
			return Response.json({ valid: false });
		}

		if (url.pathname === "/api/internal/deduct" && request.method === "POST") {
			return Response.json({ ok: true });
		}

		return new Response("Not Found", { status: 404 });
	},
};
