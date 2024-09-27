declare module '@pollinations/react' {
  export function usePollinationsChat(
    initialMessages: { role: string; content: string }[],
    options: { seed: number; model: string; jsonMode?: boolean }
  ): { sendUserMessage: (message: string) => void; messages: { role: string; content: string }[] };

  export function usePollinationsImage(
    prompt: string,
    options: { width: number; height: number; seed: number; model: string; nologo: boolean; enhance?: boolean }
  ): string;

  export function usePollinationsText(
    prompt: string,
    options: { seed: number; model: string; systemPrompt?: string }
  ): string;
}