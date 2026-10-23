import { z } from "zod";

const SafeMcpPartSchema = z.union([
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({
        type: z.literal("resource_link"),
        uri: z.string(),
        name: z.string(),
        description: z.string().optional(),
        mimeType: z.string().optional(),
    }),
]);

type SafeMcpOutput = {
    content: z.infer<typeof SafeMcpPartSchema>[];
    isError?: boolean;
};

// Retain usable output and media links without copying binary blobs into
// model history or the public Responses stream.
export function safeMcpOutput(output: unknown): SafeMcpOutput {
    const result = output as { content?: unknown; isError?: boolean } | null;
    return {
        content: Array.isArray(result?.content)
            ? result.content.flatMap((part) => {
                  const parsed = SafeMcpPartSchema.safeParse(part);
                  if (parsed.success) return [parsed.data];
                  if (
                      !part ||
                      typeof part !== "object" ||
                      typeof part.type !== "string"
                  )
                      return [];
                  if (
                      part.type === "resource" &&
                      typeof part.resource?.text === "string"
                  ) {
                      return [
                          { type: "text" as const, text: part.resource.text },
                      ];
                  }
                  return [
                      {
                          type: "text" as const,
                          text: `[${part.type} output omitted; use an HTTPS resource link]`,
                      },
                  ];
              })
            : [],
        ...(result?.isError ? { isError: true } : {}),
    };
}

export function safeMcpModelOutput({ output }: { output: unknown }) {
    const value = safeMcpOutput(output).content.map((part) => ({
        type: "text" as const,
        text:
            part.type === "text"
                ? part.text
                : JSON.stringify({
                      type: part.type,
                      ...(part.type === "resource_link"
                          ? {
                                uri: part.uri,
                                name: part.name,
                                description: part.description,
                                mimeType: part.mimeType,
                            }
                          : {}),
                  }),
    }));
    return value.length
        ? { type: "content" as const, value }
        : {
              type: "text" as const,
              value: "Tool completed without text or linked output.",
          };
}
