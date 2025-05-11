// Debug script for non-streaming cache
import fetch from "node-fetch";

async function testNonStreamingCache() {
  console.log("Testing non-streaming cache...");

  // First request - should be a cache miss
  console.log("\n--- First request (should be MISS) ---");
  const response1 = await fetch(
    "https://text.pollinations.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "max-age=3600",
      },
      body: JSON.stringify({
        model: "openai-large",
        stream: false,
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant.",
          },
          {
            role: "user",
            content: "Hello, how are you?",
          },
        ],
      }),
    },
  );

  console.log("Status:", response1.status);
  console.log("Headers:");
  for (const [key, value] of response1.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }

  const body1 = await response1.json();
  console.log("Response ID:", body1.id);
  console.log("First request completed");

  // Wait a moment to ensure caching completes
  console.log("Waiting 2 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Second request - should be a cache hit
  console.log("\n--- Second request (should be HIT) ---");
  const response2 = await fetch(
    "https://text.pollinations.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "max-age=3600",
      },
      body: JSON.stringify({
        model: "openai-large",
        stream: false,
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant.",
          },
          {
            role: "user",
            content: "Hello, how are you?",
          },
        ],
      }),
    },
  );

  console.log("Status:", response2.status);
  console.log("Headers:");
  for (const [key, value] of response2.headers.entries()) {
    console.log(`  ${key}: ${value}`);
  }

  const body2 = await response2.json();
  console.log("Response ID:", body2.id);
  console.log("Second request completed");

  // Verify the responses are the same
  console.log("\nVerifying responses...");
  console.log("Same ID:", body1.id === body2.id);
}

testNonStreamingCache().catch(console.error);
