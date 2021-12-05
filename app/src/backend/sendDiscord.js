
 import fetch from 'node-fetch';




export const sendToDiscord = async (message) => {
    const msgToDiscord = {
        "username": "pollinations",
        "avatar_url": "https://i.imgur.com/4M34hi2.png",
        "content": message
     }
    
    const result = await fetch("https://discord.com/api/webhooks/916931514313351228/oP8RFRfDSqLbFIbroYMpWshXLA-kXcVF9HZ8b2bj2dIjj_5mCjsr2g74C-E4iWV7aXT9"
    ,{
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(msgToDiscord)
      });
    console.log(await result.text())
}
