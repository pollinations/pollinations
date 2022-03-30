// Get a CID, get it's contents and then post to discord via webhook.

const pollenPostWebhookUrl = process.env["POLLEN_POST_WEBHOOK_URL"];

export async function discordPollenPostWebhook({title, coverImage, url }) {
    const discordMessage = {
        "username": "PollenPost",
        "avatar_url": "https://avatars.githubusercontent.com/u/86964862?s=200&v=4",
        "content": title,
        "embeds": [
            {
                "title": title,
                "image": {
                    "url": coverImage
                },
                "url": url
            }
        ]
    }
    return fetch(pollenPostWebhookUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(discordMessage)
    })
}