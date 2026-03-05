'use client';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageAttachment,
  MessageAttachments,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { ErrorAlert } from '@/components/ErrorAlert';
import { useTextModels } from '@/components/ModelsProvider';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { useChat } from '@ai-sdk/react';
import { CheckIcon, CopyIcon, RefreshCcwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const suggestions = [
  'What are the latest trends in AI?',
  'How does machine learning work?',
  'Explain quantum computing',
  'Best practices for React development',
  'Tell me about TypeScript benefits',
  'How to optimize database queries?',
  'What is the difference between SQL and NoSQL?',
  'Explain cloud computing basics',
];

export default function Chat() {
  const { apiKey } = usePollinationsApiKey();
  const availableModels = useTextModels();
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>('gemini-fast');
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  // Update model when models are loaded
  useEffect(() => {
    if (
      availableModels.length > 0 &&
      !availableModels.find((m) => m.id === model)
    ) {
      setModel(availableModels[0].id);
    }
  }, [availableModels, model]);

  const selectedModelData = availableModels.find((m) => m.id === model);

  // Helper to extract provider from model name/id
  const getProviderFromModel = (
    modelId: string,
  ): {
    chef: string;
    chefSlug: string;
  } => {
    const id = modelId.toLowerCase();
    if (id.startsWith('openai') || id.includes('gpt')) {
      return { chef: 'OpenAI', chefSlug: 'openai' };
    }
    if (id.startsWith('gemini') || id.includes('google')) {
      return { chef: 'Google', chefSlug: 'google' };
    }
    if (id.startsWith('claude') || id.includes('anthropic')) {
      return { chef: 'Anthropic', chefSlug: 'anthropic' };
    }
    if (id.startsWith('sonar') || id.includes('perplexity')) {
      return { chef: 'Perplexity', chefSlug: 'perplexity' };
    }
    if (id.startsWith('deepseek')) {
      return { chef: 'DeepSeek', chefSlug: 'deepseek' };
    }
    if (id.startsWith('mistral')) {
      return { chef: 'Mistral', chefSlug: 'mistral' };
    }
    return { chef: 'Other', chefSlug: 'openai' };
  };

  const selectedProvider = selectedModelData
    ? getProviderFromModel(selectedModelData.id)
    : { chef: 'Other', chefSlug: 'openai' };

  // Group models by provider for ModelSelector
  const modelsByProvider = availableModels.reduce(
    (acc, model) => {
      const { chef } = getProviderFromModel(model.id);
      if (!acc[chef]) {
        acc[chef] = [];
      }
      acc[chef] = [...acc[chef], model];
      return acc;
    },
    {} as Record<string, typeof availableModels>,
  );
  const orderedProviders = [
    'OpenAI',
    'Anthropic',
    'Google',
    'Perplexity',
    'DeepSeek',
    'Mistral',
    ...Object.keys(modelsByProvider).filter(
      (p) =>
        ![
          'OpenAI',
          'Anthropic',
          'Google',
          'Perplexity',
          'DeepSeek',
          'Mistral',
        ].includes(p),
    ),
  ];

  const { messages, sendMessage, status, regenerate, error } = useChat();

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    if (message.files?.length) {
      toast.success('Files attached', {
        description: `${message.files.length} file(s) attached to message`,
      });
    }

    sendMessage(
      {
        text: message.text || 'Sent with attachments',
        files: message.files,
      },
      {
        body: {
          model: model,
          apiKey: apiKey || undefined,
        },
      },
    );
    setInput('');
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(
      { text: suggestion },
      {
        body: {
          model: model,
          apiKey: apiKey || undefined,
        },
      },
    );
  };

  return (
    <div className={'h-full w-full'}>
      <div className="flex size-full flex-col divide-y overflow-hidden max-w-2xl mx-auto">
        <Conversation className="scrollbar-hide">
          <ConversationContent className="scrollbar-hide">
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="No messages yet"
                description="Start a conversation by typing a message below."
              />
            ) : (
              messages.map((message) => {
                const messageParts = message.parts || [];
                const fileParts = messageParts.filter(
                  (part) => part.type === 'file',
                );
                const sources = messageParts.filter(
                  (part) => part.type === 'source-url',
                );
                const reasoningPart = messageParts.find(
                  (part) => part.type === 'reasoning',
                );
                const textPart = messageParts.find(
                  (part) => part.type === 'text',
                );
                const isLastMessage =
                  message.id === messages[messages.length - 1]?.id;

                return (
                  <Message key={message.id} from={message.role}>
                    <div>
                      {fileParts.length > 0 && (
                        <MessageAttachments>
                          {fileParts.map((part, i) => (
                            <MessageAttachment
                              key={`${message.id}-file-${i}`}
                              data={part}
                            />
                          ))}
                        </MessageAttachments>
                      )}
                      {message.role === 'assistant' && sources.length > 0 && (
                        <Sources>
                          <SourcesTrigger count={sources.length} />
                          {sources.map((part, i) => (
                            <SourcesContent key={`${message.id}-${i}`}>
                              <Source
                                key={`${message.id}-${i}`}
                                href={part.url}
                                title={part.url}
                              />
                            </SourcesContent>
                          ))}
                        </Sources>
                      )}
                      {reasoningPart && (
                        <Reasoning
                          className="w-full"
                          isStreaming={
                            status === 'streaming' &&
                            isLastMessage &&
                            reasoningPart ===
                              messageParts[messageParts.length - 1]
                          }
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>
                            {reasoningPart.text}
                          </ReasoningContent>
                        </Reasoning>
                      )}
                      {textPart && (
                        <MessageContent>
                          <MessageResponse>{textPart.text}</MessageResponse>
                        </MessageContent>
                      )}
                    </div>
                    {message.role === 'assistant' &&
                      isLastMessage &&
                      textPart && (
                        <MessageActions>
                          <MessageAction
                            onClick={() =>
                              regenerate({
                                body: {
                                  model: model,
                                  apiKey: apiKey,
                                },
                              })
                            }
                            label="Retry"
                          >
                            <RefreshCcwIcon className="size-3" />
                          </MessageAction>
                          <MessageAction
                            onClick={() =>
                              navigator.clipboard.writeText(textPart.text)
                            }
                            label="Copy"
                          >
                            <CopyIcon className="size-3" />
                          </MessageAction>
                        </MessageActions>
                      )}
                  </Message>
                );
              })
            )}
            {status === 'submitted' && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                <Loader />
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {error?.message && (
          <div className="shrink-0 px-4 py-2">
            <ErrorAlert message={error.message} />
          </div>
        )}

        <div className="grid shrink-0 gap-4 pt-4">
          <Suggestions className="px-4">
            {suggestions.map((suggestion) => (
              <Suggestion
                key={suggestion}
                onClick={() => handleSuggestionClick(suggestion)}
                suggestion={suggestion}
              />
            ))}
          </Suggestions>
          <div className="w-full px-4 pb-4">
            <PromptInput
              onSubmit={handleSubmit}
              className="mt-4"
              globalDrop
              multiple
            >
              <PromptInputHeader>
                <PromptInputAttachments>
                  {(attachment) => <PromptInputAttachment data={attachment} />}
                </PromptInputAttachments>
              </PromptInputHeader>
              <PromptInputBody>
                <PromptInputTextarea
                  onChange={(e) => setInput(e.target.value)}
                  value={input}
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>
                  <ModelSelector
                    onOpenChange={setModelSelectorOpen}
                    open={modelSelectorOpen}
                  >
                    <ModelSelectorTrigger asChild>
                      <PromptInputButton>
                        {selectedProvider.chefSlug && (
                          <ModelSelectorLogo
                            provider={selectedProvider.chefSlug as any}
                          />
                        )}
                        {selectedModelData?.name && (
                          <ModelSelectorName>
                            {selectedModelData.name}
                          </ModelSelectorName>
                        )}
                      </PromptInputButton>
                    </ModelSelectorTrigger>
                    <ModelSelectorContent>
                      <ModelSelectorInput placeholder="Search models..." />
                      <ModelSelectorList>
                        <ModelSelectorEmpty>
                          No models found.
                        </ModelSelectorEmpty>
                        {orderedProviders
                          .filter((p) => modelsByProvider[p])
                          .map((chef) => (
                            <ModelSelectorGroup heading={chef} key={chef}>
                              {modelsByProvider[chef].map((m) => {
                                const provider = getProviderFromModel(m.id);
                                return (
                                  <ModelSelectorItem
                                    key={m.id}
                                    onSelect={() => {
                                      setModel(m.id);
                                      setModelSelectorOpen(false);
                                    }}
                                    value={m.id}
                                  >
                                    <ModelSelectorLogo
                                      provider={provider.chefSlug as any}
                                    />
                                    <ModelSelectorName>
                                      {m.name}
                                    </ModelSelectorName>
                                    <ModelSelectorLogoGroup>
                                      <ModelSelectorLogo
                                        provider={provider.chefSlug as any}
                                      />
                                    </ModelSelectorLogoGroup>
                                    {model === m.id ? (
                                      <CheckIcon className="ml-auto size-4" />
                                    ) : (
                                      <div className="ml-auto size-4" />
                                    )}
                                  </ModelSelectorItem>
                                );
                              })}
                            </ModelSelectorGroup>
                          ))}
                      </ModelSelectorList>
                    </ModelSelectorContent>
                  </ModelSelector>
                </PromptInputTools>
                <PromptInputSubmit
                  disabled={!input && !status}
                  status={status}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>
    </div>
  );
}
