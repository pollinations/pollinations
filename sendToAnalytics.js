import 'dotenv/config'

const measurementId = process.env.GA_MEASUREMENT_ID;
const apiSecret = process.env.GA_API_SECRET;



export async function sendToAnalytics(request, name, metadata) {
    const referrer = request.headers.referer || request.headers.referrer;

    // robustly determine a unique client id from the request
    const client_id = request.headers["x-real-ip"] || request.headers['x-forwarded-for'] || request.connection.remoteAddress;    

    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
        method: "POST",
        body: JSON.stringify({
        client_id,
        "events": [{
            "name": name,
            "params": {...metadata, referrer }
        }]
        })
    });
    const responseText = await response.text();
    // console.log("Google Analytics response text:", responseText);
    // console.log("Google Analytics response status:", response.status);
}