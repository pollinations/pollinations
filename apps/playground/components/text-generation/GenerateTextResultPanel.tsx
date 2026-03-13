'use client';

import type { GenerateTextResult } from 'ai';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JsonResult } from './JsonResult';
import { SourcesList } from './SourcesList';
import { TextResult } from './TextResult';
import { UsageCard } from './UsageCard';

type AnyGenerateTextResult = GenerateTextResult<any, any>;

type ToolCallInfo = {
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
};

interface GenerateTextResultPanelProps {
  response: AnyGenerateTextResult | null;
  /**
   * When true, shows a Tool Calls section if tool calls are present
   * on the response (used by the Tool Calling example).
   */
  showToolCalls?: boolean;
  /**
   * Optional custom placeholder for the main result area when there is no response.
   */
  placeholderText?: string;
}

export function GenerateTextResultPanel({
  response,
  showToolCalls = false,
  placeholderText = 'No result yet. Submit a prompt to see the output.',
}: GenerateTextResultPanelProps) {
  let hasStructuredOutput = false;
  try {
    hasStructuredOutput =
      response?.output !== undefined &&
      response?.output !== null &&
      typeof response?.output === 'object';
  } catch (ignore) {}

  const sources = response?.sources ?? [];

  const reasoningContent = response?.reasoningText;

  const toolCalls: ToolCallInfo[] =
    showToolCalls && response?.toolCalls
      ? response.toolCalls.map((call) => ({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.input,
          output: response.toolResults?.find(
            (result) => result.toolCallId === call.toolCallId,
          )?.output,
        }))
      : [];

  return (
    <div className="space-y-4">
      {/* Reasoning content (before text) */}
      {reasoningContent && (
          <TextResult text={reasoningContent} title='Reasoning' />
      )}

      {/* Main result: text (markdown) or structured JSON */}
      {hasStructuredOutput ? (
        <JsonResult value={response?.output} placeholder={placeholderText} />
      ) : (
        <TextResult text={response?.text} placeholder={placeholderText} />
      )}

      {/* Optional Tool Calls section */}
      {showToolCalls && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-4">Tool Calls</h3>
          </div>

          {toolCalls.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Executed Tool Calls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  {toolCalls.map((call, index) => (
                    <div
                      key={call.toolCallId ?? index}
                      className="rounded-md border bg-muted/50 p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">
                          {call.toolName ?? 'Unknown tool'}
                        </span>
                        {call.toolCallId && (
                          <span className="text-xs text-muted-foreground">
                            {call.toolCallId}
                          </span>
                        )}
                      </div>

                      {call.input != null && (
                        <div className="mt-1">
                          <p className="text-xs text-muted-foreground mb-0.5">
                            Input
                          </p>
                          <pre className="text-xs overflow-auto rounded bg-background/80 p-2 border">
                            {String(
                              typeof call.input === 'string'
                                ? call.input
                                : JSON.stringify(call.input, null, 2),
                            )}
                          </pre>
                        </div>
                      )}

                      {call.output != null && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-0.5">
                            Result
                          </p>
                          <pre className="text-xs overflow-auto rounded bg-background/80 p-2 border">
                            {String(
                              typeof call.output === 'string'
                                ? call.output
                                : JSON.stringify(call.output, null, 2),
                            )}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
              No tool calls yet. Ask the model to use tools in your prompt to
              see how tool calling works.
            </div>
          )}
        </div>
      )}

      {/* Sources */}
      <SourcesList sources={sources} />

      {/* Usage */}
      {response?.usage && <UsageCard usage={response.usage} showSectionTitle />}
    </div>
  );
}
