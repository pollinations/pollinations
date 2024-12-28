import 'dotenv/config';

const measurementId = process.env.GA_MEASUREMENT_ID;
const apiSecret = process.env.GA_API_SECRET;

export async function sendToAnalytics(request, name, metadata) {
    try {
        if (!request || !name || !measurementId || !apiSecret) {
            console.log('Missing required parameters');
            return;
        }

        const clientIP = request.headers?.["x-real-ip"] || request.headers?.['x-forwarded-for'] || request?.connection?.remoteAddress || 'unknown';

        const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
            method: "POST",
            body: JSON.stringify({
                client_id: clientIP,
                events: [{
                    name: name,
                    params: metadata || {}
                }]
            })
        });

        console.log('Analytics status:', response.status);
        return response.ok;
    } catch (error) {
        console.error('Analytics error:', error);
        return false;
    }
}
