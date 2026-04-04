/**
 * Simple script to test the 'openclaw' model preset locally before PR.
 * Requirements: API must be running locally or pointed to gen.pollinations.ai
 */

/* eslint-env node */

async function testOpenClaw() {
  const API_URL = process.env.POLLINATIONS_API_URL || "https://gen.pollinations.ai/v1/chat/completions";
  const API_KEY = process.env.POLLINATIONS_API_KEY;

  if (!API_KEY) {
    console.error("Please set POLLINATIONS_API_KEY environment variable.");
    return;
  }

  console.log(`Testing 'openclaw' model preset via ${API_URL}...`);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "openclaw",
        messages: [
          { role: "user", content: "Who are you and what are your operating rules?" }
        ],
        stream: false
      })
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`\n❌ API Error (${response.status} ${response.statusText}):`);
        console.error(errText);
        return;
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error("\n❌ Unexpected API Response Format:");
        console.log(JSON.stringify(data, null, 2));
        return;
    }

    console.log("\n--- Response From OpenClaw Preset ---");
    console.log(data.choices[0].message.content);
    console.log("\n--- Metadata ---");
    console.log("Model Used:", data.model);
  } catch (error) {
    console.error("\n❌ Error testing model:", error.message);
  }
}

testOpenClaw();
