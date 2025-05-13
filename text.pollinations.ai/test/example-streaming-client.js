// Example client for testing both streaming formats

// Plain text streaming (GET request)
async function testGetStreaming() {
  console.log("Testing GET streaming (plain text format):");
  const prompt = "Tell me a short story about a robot";
  const encodedPrompt = encodeURIComponent(prompt);
  
  try {
    const response = await fetch(`http://localhost:3000/${encodedPrompt}?stream=true`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Create a reader to read the stream chunks
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    
    // Process the stream chunk by chunk
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log("Stream complete");
        break;
      }
      
      // Decode the chunk as plain text
      const chunk = decoder.decode(value, { stream: true });
      result += chunk;
      console.log("Received chunk:", chunk);
    }
    
    console.log("Final result:", result);
  } catch (error) {
    console.error("Error in GET streaming:", error);
  }
}

// OpenAI format streaming (POST request)
async function testPostStreaming() {
  console.log("Testing POST streaming (OpenAI SSE format):");
  
  try {
    const response = await fetch('http://localhost:3000/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Tell me a short story about a robot' }],
        stream: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Create a reader to read the stream chunks
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    
    // Process the SSE stream
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log("Stream complete");
        break;
      }
      
      // Decode the chunk and process SSE format
      const chunk = decoder.decode(value, { stream: true });
      console.log("Raw chunk:", chunk);
      
      // Parse SSE data
      const lines = chunk.split('\n\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            console.log("Received [DONE] signal");
          } else {
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                const content = parsed.choices[0].delta.content;
                result += content;
                console.log("Content:", content);
              }
            } catch (e) {
              console.error("Error parsing JSON:", e);
            }
          }
        }
      }
    }
    
    console.log("Final result:", result);
  } catch (error) {
    console.error("Error in POST streaming:", error);
  }
}

// Run both tests
async function runTests() {
  await testGetStreaming();
  console.log("\n----------\n");
  await testPostStreaming();
}

runTests();
