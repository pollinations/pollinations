from polli_agent.main import run

if __name__ == "__main__":
    import asyncio
    import os

    prompt = os.getenv("POLLI_PROMPT", "Explain RAG with a diagram")
    result = asyncio.run(run(prompt))
    print(result)
