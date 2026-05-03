import { ask } from "./agent.ts";

export async function handleWebRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const body = (await req.json().catch(() => null)) as
    | { question?: string; imageUrl?: string }
    | null;
  if (!body?.question) return new Response("question required", { status: 400 });

  const auth = req.headers.get("authorization");
  const apiKey = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

  try {
    const turn = await ask(body.question, body.imageUrl, apiKey);
    return Response.json(turn);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

export default { fetch: handleWebRequest };
