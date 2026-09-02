const HERMES_APP_KEY = "pk_6qmH5idGyIiJdbgA";

function startAuthorize() {
  const redirectUrl = encodeURIComponent(window.location.origin + window.location.pathname);
  const models = encodeURIComponent("kimi,kimi-code,deepseek,deepseek-pro,glm,gemini-fast,gemini-search,perplexity-fast,claude-fast,qwen-coder,grok");
  window.location.href = `https://enter.pollinations.ai/authorize?redirect_url=${redirectUrl}&models=${models}&app_key=${encodeURIComponent(HERMES_APP_KEY)}`;
}

async function updateModelCount() {
  const count = document.getElementById("model-count");
  try {
    const response = await fetch("https://gen.pollinations.ai/v1/models");
    if (!response.ok) throw new Error("catalog unavailable");
    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    count.textContent = models.length || "Live";
  } catch {
    count.textContent = "Live";
  }
}

document.querySelectorAll(".copy").forEach((button) => {
  button.addEventListener("click", async () => {
    const code = document.querySelector(`#${button.dataset.copy} code`).textContent;
    await navigator.clipboard.writeText(code);
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = "Copy"; }, 1400);
  });
});

updateModelCount();