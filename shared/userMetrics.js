/**
 * Increment a user metric using the Pollinations admin API
 * @param {string} userId - The user ID to increment metrics for
 * @param {string} metricKey - The metric key to increment (e.g., 'ad_clicks', 'affiliate_clicks')
 * @param {number} incrementBy - Amount to increment by (default: 1)
 * @returns {Promise<void>} - Fire and forget promise that handles errors internally
 */
export async function incrementUserMetric(userId, metricKey, incrementBy = 1) {
    // DISABLED: All metrics updates disabled to resolve DB contention (GitHub Issue #3258)
    console.log(
        `DISABLED: Skipping ${metricKey} increment for user ${userId} (metrics disabled)`,
    );
    return;

    if (!userId) {
        console.log(`No user ID provided. Skipping ${metricKey} increment.`);
        return;
    }

    console.log(
        `User ID found: ${userId}. Attempting to increment ${metricKey}.`,
    );

    const adminApiKey = process.env.ADMIN_API_KEY;
    if (!adminApiKey) {
        console.log(
            `ADMIN_API_KEY not found in environment. Cannot increment ${metricKey}.`,
        );
        return;
    }

    const metricsUrl = `https://enter.pollinations.ai/admin/metrics?user_id=${encodeURIComponent(userId)}`;
    const metricsPayload = {
        increment: {
            key: metricKey,
            by: incrementBy,
        },
    };

    // Fire and forget - do not await to avoid blocking the caller
    fetch(metricsUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${adminApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(metricsPayload),
    })
        .then(async (response) => {
            const responseBodyText = await response.text();
            try {
                const responseBody =
                    response.headers
                        .get("content-type")
                        ?.includes("application/json") && responseBodyText
                        ? JSON.parse(responseBodyText)
                        : responseBodyText;
                if (!response.ok) {
                    console.error(
                        `Failed to increment ${metricKey} for user ${userId}. Status: ${response.status}`,
                        responseBody,
                    );
                } else {
                    console.log(
                        `Successfully triggered ${metricKey} increment for user ${userId}. Response:`,
                        responseBody,
                    );
                }
            } catch (e) {
                console.error(
                    `Error parsing metrics response for user ${userId} (Status: ${response.status}):`,
                    e,
                    `Raw Body: ${responseBodyText}`,
                );
            }
        })
        .catch((error) => {
            console.error(
                `Network error or other issue incrementing ${metricKey} for user ${userId}:`,
                error,
            );
        });
}
