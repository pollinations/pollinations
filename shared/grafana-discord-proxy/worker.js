/**
 * Grafana → Discord Webhook Proxy
 * Strips embed titles from Grafana alerts before forwarding to Discord.
 */

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders() });
        }

        if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405 });
        }

        if (!env.DISCORD_WEBHOOK_URL) {
            return new Response(
                JSON.stringify({ error: "DISCORD_WEBHOOK_URL not configured" }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }

        try {
            const grafanaPayload = await request.json();
            const discordPayload = transformGrafanaToDiscord(grafanaPayload);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(env.DISCORD_WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(discordPayload),
                signal: controller.signal,
            }).finally(() => clearTimeout(timeout));

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Discord error:", response.status, errorText);
                return new Response(
                    JSON.stringify({ error: `Discord: ${response.status}` }),
                    {
                        status: 502,
                        headers: { "Content-Type": "application/json" },
                    },
                );
            }

            return new Response(JSON.stringify({ received: true }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders(),
                },
            });
        } catch (err) {
            console.error("Proxy error:", err);
            return new Response(JSON.stringify({ error: String(err) }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    },
};

function transformGrafanaToDiscord(grafana) {
    const alerts = grafana.alerts || [];

    const firingAlerts = alerts.filter((a) => a.status === "firing");

    if (firingAlerts.length === 0) {
        return { content: grafana.message || "Alert received" };
    }

    // Bullet points with severity-based emoji at end
    const lines = firingAlerts.map((alert) => {
        const model = alert.labels?.model || "unknown";
        const severity = alert.labels?.severity || "warning";
        const summary = alert.annotations?.summary || "Alert firing";
        const emoji = severity === "critical" ? "🔴" : "🟡";
        return `• **${model}**: ${summary} ${emoji}`;
    });

    return { content: lines.join("\n") };
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}
